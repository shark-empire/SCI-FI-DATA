// Supabase "Send SMS" hook.
//
// Each time Supabase needs to text a sign-up code, it calls this function instead of using Twilio.
// The function checks that the call really came from Supabase, then sends the code through mNotify.
//
// Secrets it reads (Supabase -> Edge Functions -> Secrets):
//   MNOTIFY_API_KEY       the API key from your mNotify account
//   MNOTIFY_SENDER        the sender name approved on your mNotify account (11 characters at most)
//   SEND_SMS_HOOK_SECRET  the secret Supabase shows when you add the hook (it starts with v1,whsec_)
//
// Deploy it with "Verify JWT" switched off: Supabase proves who it is with the signature, not a login token.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

const MNOTIFY_URL = 'https://api.mnotify.com/api/sms/quick'

/** An empty 200 tells Supabase the text went out. Anything else makes the sign-up fail. */
const reply = (status: number, error?: string) =>
  new Response(JSON.stringify(error ? { error: { http_code: status, message: error } } : {}), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Supabase hands over 233541234567. mNotify's own examples use the local form, 0541234567. */
const toLocal = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('233') && digits.length === 12 ? `0${digits.slice(3)}` : digits
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return reply(405, 'POST only.')

  const apiKey = Deno.env.get('MNOTIFY_API_KEY')
  const sender = Deno.env.get('MNOTIFY_SENDER')
  const secret = (Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '').replace('v1,whsec_', '')
  if (!apiKey || !sender || !secret) {
    console.error('send-sms: MNOTIFY_API_KEY, MNOTIFY_SENDER or SEND_SMS_HOOK_SECRET is missing')
    return reply(500, 'Text messages are not set up yet.')
  }

  // Refuse anything that is not signed by Supabase, so nobody can use this URL to send texts.
  let user: { phone?: string } | undefined
  let sms: { otp?: string } | undefined
  try {
    const verified = new Webhook(secret).verify(await req.text(), Object.fromEntries(req.headers))
    user = verified.user
    sms = verified.sms
  } catch {
    return reply(401, 'The request was not signed by Supabase.')
  }

  const to = toLocal(String(user?.phone ?? ''))
  const code = String(sms?.otp ?? '')
  if (!to || !code) return reply(400, 'The request had no phone number or code.')

  let res: Response
  let data: { status?: string; code?: string | number; message?: string } = {}
  try {
    res = await fetch(`${MNOTIFY_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: [to],
        sender,
        message: `Your SCI-FI DATA code is ${code}. Do not share it with anyone.`,
        is_schedule: false,
        schedule_date: '',
      }),
    })
    data = await res.json().catch(() => ({}))
  } catch (err) {
    console.error('send-sms: could not reach mNotify:', String(err))
    return reply(502, 'Could not send the text message.')
  }

  const accepted = res.ok && (String(data.status).toLowerCase() === 'success' || String(data.code) === '2000')
  if (!accepted) {
    // The reason (wrong key, sender not approved, no credit...) goes to the function logs, not to the customer.
    console.error('send-sms: mNotify did not accept the message:', res.status, JSON.stringify(data))
    return reply(502, 'Could not send the text message.')
  }
  return reply(200)
})
