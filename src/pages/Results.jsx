import { useEffect, useMemo, useState } from 'react';
import { LuCircleAlert, LuDownload, LuMinus, LuPlus, LuTag, LuTicket } from 'react-icons/lu';
import { Button, Callout, CopyButton, PageHeader, Segmented, Spinner, TextField, Ticket } from '../components/ui';
import { useToast } from '../context/Toast';
import { useAuth } from '../context/Auth';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTint } from '../hooks/useTint';
import { unitPrice, useResultsProducts } from '../hooks/useResultsProducts';
import { config } from '../config/env';
import { site } from '../config/site';
import { money } from '../lib/format';
import { resultsRef } from '../lib/ids';
import { validatePhone, digitsOnly, cleanPhone, prettyPhone } from '../lib/phone';
import { fetchResultsPins } from '../services/webhooks';
import { loadPaystack, openPaystack } from '../services/paystack';

const MAX_QTY = 500;
const isTestKey = config.paystack.resultsKey.startsWith('pk_test');

export default function Results() {
  usePageTitle('Results checkers');
  useTint('results');
  const toast = useToast();
  const { user } = useAuth();

  const { products, status: priceStatus, reload } = useResultsProducts();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [delivery, setDelivery] = useState('sms'); // how the PIN is sent: 'sms' | 'email'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [checking, setChecking] = useState(false); // confirming the price just before the payment window opens
  const [phase, setPhase] = useState('form'); // form | verifying | done | error
  const [pins, setPins] = useState([]);
  const [lastRef, setLastRef] = useState('');
  const [snapshot, setSnapshot] = useState(null); // what was bought, kept for the voucher screen

  useEffect(() => {
    loadPaystack().catch(() => {});
  }, []);
  useEffect(() => {
    if (user) {
      // A phone account's stand-in address (…@sci-fidata.com) has no inbox, so it is never offered as an email.
      const real = user.email && !user.email.endsWith('@sci-fidata.com') ? user.email : '';
      setEmail((e) => e || real);
      setPhone((p) => p || user.phone || '');
    }
  }, [user]);

  // The chosen exam, or the first one on sale. Prices come from the results_products table (see hooks/useResultsProducts).
  const product = products.find((p) => p.id === productId && p.available) || products.find((p) => p.available) || null;
  const unit = product ? unitPrice(product, quantity) : 0;
  const bulk = Boolean(product && product.bulkPrice != null && quantity > product.bulkThreshold);
  const total = Math.round(unit * quantity * 100) / 100;
  const savings = bulk ? (product.price - product.bulkPrice) * quantity : 0;

  // The contact for the chosen way of receiving the PIN is required; the other one is optional but must be valid if given.
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const phoneCheck = validatePhone(phone);
  const emailBad = delivery === 'email' ? !emailOk : email.trim() !== '' && !emailOk;
  const phoneBad = delivery === 'sms' ? !phoneCheck.ok : phone !== '' && !phoneCheck.ok;

  const setQty = (n) => setQuantity(Math.min(MAX_QTY, Math.max(1, Number.isFinite(n) ? n : 1)));

  const verify = async (reference, snap) => {
    setPhase('verifying');
    try {
      const data = await fetchResultsPins({
        reference,
        productId: snap.productId,
        quantity: snap.quantity,
        delivery: snap.delivery,
        deliveryTo: snap.deliveryTo,
        email: snap.email,
        phone: snap.phone,
      });
      const list = Array.isArray(data.pins) ? data.pins : [];
      if (!list.length) throw new Error('No vouchers returned');
      setPins(list);
      setPhase('done');
    } catch {
      setPhase('error');
    }
  };

  const pay = async () => {
    setTouched(true);
    if (!product) return;
    if (emailBad || phoneBad) {
      toast.err(delivery === 'sms' ? 'Enter a valid phone number first.' : 'Enter a valid email address first.');
      return;
    }

    // Read the price list again right now: if it was changed while this page was open, the person sees the new total
    // instead of paying an old price that the payment check would then refuse.
    setChecking(true);
    let fresh;
    try {
      fresh = await reload();
    } catch {
      setChecking(false);
      toast.err('We couldn’t confirm today’s price. Check your connection and try again.');
      return;
    }
    setChecking(false);
    const live = fresh.products.find((p) => p.id === product.id);
    if (!live || !live.available) {
      toast.err(`${product.name} checkers are not available right now.`);
      return;
    }
    if (unitPrice(live, quantity) !== unit) {
      toast.err('The price was just updated. Check the new total, then pay.');
      return;
    }

    const reference = resultsRef();
    const phoneDigits = digitsOnly(phone);
    const to = delivery === 'sms' ? phoneDigits : email.trim();
    const snap = { productId: product.id, name: product.full, quantity, email: email.trim(), phone: phoneDigits, delivery, deliveryTo: to };
    try {
      await openPaystack({
        key: config.paystack.resultsKey,
        // Paystack always needs an email. Someone who chose SMS and gave none gets a stand-in built from their number.
        email: snap.email || `${phoneDigits}@sci-fidata.com`,
        amount: total,
        reference,
        metadata: {
          phone: phoneDigits,
          email: snap.email,
          // Where the PIN should be sent: "sms" or "email", and the number or address to send it to.
          delivery,
          delivery_to: to,
          product_id: product.id,
          product_name: product.full,
          quantity,
          unit_price: unit,
          bulk_discount_applied: bulk,
        },
        onSuccess: (res) => {
          setLastRef(res.reference);
          setSnapshot(snap);
          verify(res.reference, snap);
        },
        onClose: () => {},
      });
    } catch (e) {
      toast.err(e.message || 'Could not open the payment window.');
    }
  };

  const reset = () => {
    setPhase('form');
    setPins([]);
    setQuantity(1);
  };

  const download = () => {
    const lines = pins.map((p, i) => `Voucher ${i + 1}\nPIN: ${p.pin}\nSerial number: ${p.serial}\n`);
    const text = `${snapshot?.name || 'Results checker'}\nReference: ${lastRef}\n\n${lines.join('\n')}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `results-checker-${lastRef}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allText = useMemo(
    () => pins.map((p, i) => `Voucher ${i + 1}: PIN ${p.pin}, Serial ${p.serial}`).join('\n'),
    [pins],
  );

  if (phase === 'verifying') {
    return (
      <div className="container page page--narrow">
        <div className="status">
          <div className="status__icon status__icon--busy"><Spinner size={34} /></div>
          <h1 className="status__title">Getting your {quantity > 1 ? 'vouchers' : 'voucher'}</h1>
          <p className="status__text">Payment received. Please keep this page open while we generate your PIN{quantity > 1 ? 's' : ''}.</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="container page page--narrow">
        <div className="status">
          <div className="status__icon status__icon--warn"><LuCircleAlert size={34} /></div>
          <h1 className="status__title">Payment received, vouchers not shown yet</h1>
          <p className="status__text">
            Your payment went through, but we couldn’t fetch your PINs just now. Don’t pay again. Send us this reference and we’ll
            sort it out.
          </p>
          <p className="receipt__ref receipt__ref--center"><span>Reference</span><code>{lastRef}</code><CopyButton text={lastRef} /></p>
          <div className="status__actions">
            <Button onClick={() => verify(lastRef, snapshot)}>Try again</Button>
            <Button variant="secondary" href={site.whatsappUrl(`Hi, I paid for a results checker but did not get my PIN. Reference: ${lastRef}`)} target="_blank" rel="noreferrer">Message support</Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="container page">
        <PageHeader
          title={pins.length > 1 ? 'Your vouchers' : 'Your voucher'}
          lead={`${snapshot?.name}. Keep these safe: anyone with the PIN and serial number can use them. ${
            snapshot?.delivery === 'sms'
              ? `We are also texting a copy to ${prettyPhone(snapshot.phone)}.`
              : `We are also emailing a copy to ${snapshot?.email}.`
          }`}
          actions={
            <>
              <CopyButton text={allText} label="Copy all" />
              <Button variant="secondary" size="sm" onClick={download}><LuDownload aria-hidden="true" /> Download</Button>
            </>
          }
        />
        <ul className="vouchers">
          {pins.map((p, i) => (
            <li key={`${p.serial}-${i}`}>
              <Ticket
                top={<div className="voucher__head"><LuTicket aria-hidden="true" /> {snapshot?.name}<span className="voucher__no">Voucher {i + 1}</span></div>}
                bottom={
                  <dl className="voucher__codes">
                    <div><dt>PIN</dt><dd><code>{p.pin}</code><CopyButton text={String(p.pin)} /></dd></div>
                    <div><dt>Serial number</dt><dd><code>{p.serial}</code><CopyButton text={String(p.serial)} /></dd></div>
                  </dl>
                }
              />
            </li>
          ))}
        </ul>
        <div className="status__actions status__actions--left">
          <Button onClick={reset}>Buy more checkers</Button>
          <p className="status__fine">Reference {lastRef}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <PageHeader title="Results checkers" lead="Buy a WASSCE, NOVDEC or BECE results checker. Your PIN and serial number appear right after payment." />

      {isTestKey && (
        <Callout tone="info" icon={LuTag}>
          <strong>Test mode.</strong> Payments on this page use Paystack’s test keys, so no real money is charged.
        </Callout>
      )}

      <div className="buy">
        <div className="buy__steps">
          <section className="step" aria-labelledby="r-product">
            <h2 id="r-product" className="step__title"><span className="step__n">1</span> Exam</h2>
            {priceStatus === 'loading' && <p className="qty__note">Loading today’s prices…</p>}
            {priceStatus === 'error' && (
              <Callout tone="bad" icon={LuCircleAlert}>
                We couldn’t load today’s prices.{' '}
                <button type="button" className="linkbtn" onClick={() => reload().catch(() => {})}>Try again</button>
              </Callout>
            )}
            {priceStatus === 'ready' && !product && (
              <Callout tone="info" icon={LuTag}>Results checkers are not on sale right now. Please check back soon.</Callout>
            )}
            <div className="products" role="radiogroup" aria-label="Exam">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={product?.id === p.id}
                  disabled={!p.available}
                  className={`product${product?.id === p.id ? ' is-on' : ''}`}
                  onClick={() => setProductId(p.id)}
                >
                  <span className="product__name">{p.name}</span>
                  <span className="product__desc">{p.desc}</span>
                  <span className="product__price">{p.available ? money(unitPrice(p, quantity)) : 'Unavailable'}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="step" aria-labelledby="r-qty">
            <h2 id="r-qty" className="step__title"><span className="step__n">2</span> How many?</h2>
            <div className="qty">
              <div className="stepper" role="group" aria-label="Quantity">
                <button type="button" onClick={() => setQty(quantity - 1)} aria-label="One fewer" disabled={quantity <= 1}><LuMinus aria-hidden="true" /></button>
                <input
                  aria-label="Quantity"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQty(parseInt(e.target.value.replace(/\D/g, ''), 10))}
                />
                <button type="button" onClick={() => setQty(quantity + 1)} aria-label="One more" disabled={quantity >= MAX_QTY}><LuPlus aria-hidden="true" /></button>
              </div>
              {product?.bulkPrice != null &&
                (bulk ? (
                  <p className="qty__note qty__note--on"><LuTag aria-hidden="true" /> Bulk price: {money(product.bulkPrice)} each. You save {money(savings)}.</p>
                ) : (
                  <p className="qty__note">Buy more than {product.bulkThreshold} and each one costs {money(product.bulkPrice)}.</p>
                ))}
            </div>
          </section>

          <section className="step" aria-labelledby="r-you">
            <h2 id="r-you" className="step__title"><span className="step__n">3</span> Your details</h2>
            <div className="field">
              <span className="field__label">Send my PIN by</span>
              <Segmented
                label="Send my PIN by"
                value={delivery}
                onChange={setDelivery}
                options={[{ value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }]}
              />
            </div>
            <div className="fields2">
              <TextField
                label={delivery === 'email' ? 'Email address' : 'Email address (optional)'}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={touched && emailBad ? 'Enter a valid email address' : undefined}
                hint={delivery === 'email' ? 'Your PIN is sent here, and Paystack emails your receipt here.' : 'Paystack emails your payment receipt here.'}
              />
              <TextField
                label="Phone number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={16}
                prefix="+233"
                placeholder="0541234567"
                value={phone}
                onChange={(e) => setPhone(cleanPhone(e.target.value))}
                error={touched && phoneBad ? phoneCheck.msg : undefined}
                hint={delivery === 'sms' ? 'Your PIN is sent here by SMS.' : 'In case we need to reach you.'}
              />
            </div>
          </section>
        </div>

        <aside className="buy__summary" aria-label="Order summary">
          <Ticket
            top={
              <>
                <h2 className="summary__title">Your order</h2>
                <dl className="summary">
                  <div><dt>Item</dt><dd>{product ? product.full : '–'}</dd></div>
                  <div><dt>Price</dt><dd>{quantity} × {money(unit)}</dd></div>
                  {bulk && <div className="summary__save"><dt>Bulk saving</dt><dd>−{money(savings)}</dd></div>}
                </dl>
              </>
            }
            bottom={
              <>
                <div className="summary__total"><span>Total</span><strong>{money(total)}</strong></div>
                <Button block size="lg" onClick={pay} loading={checking} disabled={!product || priceStatus !== 'ready'}>Pay {money(total)}</Button>
                <p className="summary__fine">Payments are processed by Paystack. Vouchers are shown on screen after payment{delivery === 'sms' ? ' and sent to you by SMS' : ' and sent to you by email'}.</p>
              </>
            }
          />
        </aside>
      </div>
    </div>
  );
}
