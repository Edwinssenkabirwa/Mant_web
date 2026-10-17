import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import { useLookups } from '../../context/LookupContext.jsx'
import { Brand } from './Brand.jsx'

const SOCIAL = [
  { key: 'facebook', label: 'Facebook' },
  { key: 'twitter', label: 'X / Twitter' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
]

export function SiteFooter() {
  const { company } = useLookups()
  const year = new Date().getFullYear()
  const links = SOCIAL.filter((item) => company?.[item.key])
  const address = [company?.address, company?.city, company?.country].filter(Boolean).join(', ')

  return (
    <footer className="site-footer">
      <div className="container container-wide">
        <div className="footer-grid">
          <div>
            <Brand />
            <p className="footer-about" style={{ marginTop: 16 }}>
              Bridging gaps — making possibilities real. Mant Bridges LTD manages property, tenancies and arrears from
              Kampala, with a written record behind every figure on this site.
            </p>
            <p className="footer-strip">Professional · Trusted · Result driven</p>
            <div className="row" style={{ marginTop: 16, gap: 10 }}>
              {links.map((item) => (
                <a
                  key={item.key}
                  href={company[item.key]}
                  target="_blank"
                  rel="noreferrer"
                  className="pill"
                  style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4>Explore</h4>
            <Link to="/properties">Properties for rent</Link>
            <Link to="/properties?listing_type=SALE">Properties for sale</Link>
            <Link to="/services">Services</Link>
            <Link to="/about">About us</Link>
            <Link to="/blog">Property blog</Link>
            <Link to="/careers">Careers</Link>
          </div>

          <div>
            <h4>Account</h4>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Open an account</Link>
            <Link to="/manage">Landlord dashboard</Link>
            <Link to="/portal">Tenant portal</Link>
            <Link to="/contact">Contact the desk</Link>
          </div>

          <div>
            <h4>Get in touch</h4>
            {company?.email ? (
              <a href={`mailto:${company.email}`}>
                <Mail size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: '-2px' }} />
                {company.email}
              </a>
            ) : null}
            {(company ? [company.phone, company.alt_phone, company.phone_3].filter(Boolean) : []).map(
              (number, index) => (
                <a key={number} href={`tel:${number.replace(/\s/g, '')}`}>
                  {index === 0 ? (
                    <Phone size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: '-2px' }} />
                  ) : null}
                  {number}
                </a>
              )
            )}
            {address ? (
              <p className="footer-about" style={{ marginTop: 12 }}>
                <MapPin size={14} style={{ display: 'inline', marginRight: 8, verticalAlign: '-2px' }} />
                {address}
              </p>
            ) : null}
            {!company ? <p className="footer-about">Contact details are loading…</p> : null}
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {year} {company?.legal_name || company?.name || 'Mant Bridges LTD'}. All rights reserved.
          </span>
          <span>{company?.website ? <a href={company.website} target="_blank" rel="noreferrer">{company.website.replace(/^https?:\/\//, '')}</a> : 'Kampala, Uganda'}</span>
        </div>
      </div>
    </footer>
  )
}
