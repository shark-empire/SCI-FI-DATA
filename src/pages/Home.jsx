import { LuBadgeCheck, LuCode, LuLock, LuPackage, LuWallet } from 'react-icons/lu';
import { Button, NetworkChip } from '../components/ui';
import RateCard from '../components/RateCard';
import { Link } from '../router';
import { usePageTitle } from '../hooks/usePageTitle';
import { site, FAQ, NETWORKS, RESULTS_BULK_PRICE, RESULTS_BULK_THRESHOLD, RESULTS_PRODUCTS, RESULTS_REGULAR_PRICE } from '../config/site';
import { money } from '../lib/format';

const STEPS = [
  { title: 'Choose a bundle', text: 'Pick MTN, Telecel or AirtelTigo, then the size that suits you.' },
  { title: 'Enter the number', text: 'We show the registered owner’s name so you can confirm it is the right line.' },
  { title: 'Pay with Paystack', text: 'Use Mobile Money, card or bank transfer. We never see your PIN or card details.' },
  { title: 'Receive your data', text: 'Most bundles arrive within 1 to 2 minutes. Track the order with your reference.' },
];

export default function Home() {
  usePageTitle(null);

  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__copy">
            <h1 className="hero__title">Buy data and exam result vouchers in minutes.</h1>
            <p className="hero__lead">
              Choose a network, pay with Mobile Money or card, and the bundle lands on the number you pick. WASSCE, NOVDEC and BECE
              results checkers appear on screen as soon as you have paid.
            </p>
            <div className="hero__cta">
              <Button to="/data" size="lg">Buy data</Button>
              <Button to="/results" size="lg" variant="secondary">Get a results checker</Button>
            </div>
            <ul className="hero__points">
              <li><LuLock aria-hidden="true" /> Paystack checkout. Your card and PIN stay private.</li>
              <li><LuBadgeCheck aria-hidden="true" /> Owner name shown before you pay for data.</li>
              <li><LuPackage aria-hidden="true" /> Track any order with its reference.</li>
            </ul>
          </div>
          <RateCard />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section__title">What you can buy</h2>
          <div className="offers">
            <article className="offer offer--data">
              <h3 className="offer__title">Data bundles</h3>
              <p className="offer__text">Bundles for any MTN, Telecel or AirtelTigo number, yours or someone else’s.</p>
              <table className="deliverytable">
                <caption className="sr-only">Typical delivery time by network</caption>
                <thead>
                  <tr><th scope="col">Network</th><th scope="col">Usually delivered in</th></tr>
                </thead>
                <tbody>
                  {NETWORKS.map((n) => (
                    <tr key={n.id}>
                      <th scope="row"><NetworkChip network={n.id} long /></th>
                      <td>{n.delivery}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Button to="/data" variant="onDark">Browse bundles</Button>
            </article>

            <article className="offer offer--results">
              <h3 className="offer__title">Results checkers</h3>
              <p className="offer__text">A PIN and serial number to check results online. Delivered on screen and by email.</p>
              <ul className="pricelist">
                {RESULTS_PRODUCTS.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <span className="pricelist__price">{money(RESULTS_REGULAR_PRICE)}</span>
                  </li>
                ))}
              </ul>
              <p className="offer__note">
                Buying more than {RESULTS_BULK_THRESHOLD}? Each one costs <strong>{money(RESULTS_BULK_PRICE)}</strong>.
              </p>
              <Button to="/results" variant="primary">Choose a checker</Button>
            </article>
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <h2 className="section__title">How buying data works</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="steps__item">
                <span className="steps__n" aria-hidden="true">{i + 1}</span>
                <h3 className="steps__title">{s.title}</h3>
                <p className="steps__text">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div className="split__text">
            <h2 className="section__title">Buying often? Open an account.</h2>
            <ul className="checklist">
              <li><LuWallet aria-hidden="true" /> Keep a wallet balance and pay for bundles in one tap.</li>
              <li><LuPackage aria-hidden="true" /> See every order you have placed in one place.</li>
              <li><LuCode aria-hidden="true" /> Building an app or reselling? Use our REST API to place orders from your own system.</li>
            </ul>
            <div className="split__cta">
              <Button to="/signup">Create an account</Button>
              <Button to="/developers" variant="secondary">Read the API docs</Button>
            </div>
          </div>
          <figure className="codecard">
            <figcaption className="codecard__cap">Place an order from your own code</figcaption>
            <pre className="codecard__pre" tabIndex={0}><code>{`curl -X POST https://api.sci-fidata.com/v1/orders \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "bundle_id": "b1",
    "phone": "0244123456",
    "payment_method": "wallet"
  }'`}</code></pre>
          </figure>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container faq">
          <h2 className="section__title">Questions people ask</h2>
          <div className="faq__list">
            {FAQ.slice(0, 5).map((f) => (
              <details key={f.q} className="faq__item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <p className="faq__more">More answers are in the <Link to="/how-it-works">buying guide</Link>.</p>
        </div>
      </section>

      <section className="cta">
        <div className="container cta__inner">
          <div>
            <h2 className="cta__title">Top up your data now.</h2>
            <p className="cta__text">Most orders are delivered within two minutes.</p>
          </div>
          <div className="cta__actions">
            <Button to="/data" size="lg" variant="gold">Buy data</Button>
            <Button href={site.whatsappUrl('Hi, I need help with an order')} target="_blank" rel="noreferrer" size="lg" variant="onBrand">Chat on WhatsApp</Button>
          </div>
        </div>
      </section>
    </>
  );
}
