import { LuMail, LuMessageCircle } from 'react-icons/lu';
import { Link } from '../../router';
import { config } from '../../config/env';
import { site } from '../../config/site';
import Logo from '../Logo';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { to: '/data', label: 'Data bundles' },
      { to: '/results', label: 'Results checkers' },
      { to: '/track', label: 'Track order' },
    ],
  },
  {
    title: 'Help',
    links: [
      { to: '/how-it-works', label: 'How it works' },
      { to: '/support', label: 'Support' },
      { to: '/developers', label: 'Developers' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/login', label: 'Log in' },
      { to: '/signup', label: 'Create account' },
      { to: '/account/wallet', label: 'Wallet' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/terms', label: 'Terms and conditions' },
      { to: '/privacy', label: 'Privacy policy' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Logo />
          <p className="footer__about">Data bundles and WAEC results checkers for Ghana, paid for with Mobile Money or card.</p>
          <ul className="footer__contact">
            <li>
              <a href={site.whatsappUrl()} target="_blank" rel="noreferrer">
                <LuMessageCircle aria-hidden="true" /> WhatsApp +{config.contact.whatsapp}
              </a>
            </li>
            <li>
              <a href={`mailto:${config.contact.supportEmail}`}>
                <LuMail aria-hidden="true" /> {config.contact.supportEmail}
              </a>
            </li>
          </ul>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} className="footer__col" aria-label={col.title}>
            <h2 className="footer__title">{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="container footer__bottom">
        <p>© {new Date().getFullYear()} {site.name}. All rights reserved.</p>
        <p>Powered by {site.company}</p>
      </div>
    </footer>
  );
}
