import { Mail, MapPin, Phone, Star } from 'lucide-react'
import { useLookups } from '../../context/LookupContext.jsx'
import { ArcBand, Callout, Panel } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import EnquiryForm from '../../components/properties/EnquiryForm.jsx'
import { Skeleton } from '../../components/ui/Feedback.jsx'

export default function Contact() {
  const { company } = useLookups()
  const numbers = company ? [company.phone, company.alt_phone, company.phone_3].filter(Boolean) : []

  return (
    <div>
      <ArcBand
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Contact' }]}
        eyebrow="Contact"
        title="Talk to the property desk"
        lead="Enquiries about a listing, a property you want managed, an arrears instruction or works on a building all come to the same team. Use the form and we will reply by email or phone."
      />

      <section className="section-tight">
        <div className="container">
          <div className="split">
            <Panel title="Send an enquiry">
              <EnquiryForm
                title="Your message"
                defaultSubject="General enquiry"
                note="This form is logged in the enquiry inbox. It does not reserve a property or book a viewing."
              />
            </Panel>

            <aside className="sticky-side stack">
              <Panel title="Mant Bridges LTD">
                <div className="stack">
                  {company ? (
                    <>
                      <div className="feature">
                        <span className="icon-tile">
                          <Mail size={18} />
                        </span>
                        <div>
                          <p className="bold" style={{ margin: 0 }}>Email</p>
                          <a href={`mailto:${company.email}`}>{company.email}</a>
                        </div>
                      </div>
                      <div className="feature">
                        <span className="icon-tile">
                          <Phone size={18} />
                        </span>
                        <div>
                          <p className="bold" style={{ margin: 0 }}>Phone</p>
                          {numbers.length ? (
                            numbers.map((number) => (
                              <a key={number} href={`tel:${number.replace(/\s/g, '')}`} style={{ display: 'block' }}>
                                {number}
                              </a>
                            ))
                          ) : (
                            'Not published'
                          )}
                        </div>
                      </div>
                      <div className="feature">
                        <span className="icon-tile">
                          <MapPin size={18} />
                        </span>
                        <div>
                          <p className="bold" style={{ margin: 0 }}>Office</p>
                          <p className="muted" style={{ margin: 0 }}>
                            {[company.address, company.city, company.country].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Skeleton height={54} />
                      <Skeleton height={54} />
                    </>
                  )}
                </div>
              </Panel>

              {company?.payment_instructions ? (
                <Panel title="Payment instructions">
                  <div className="stack stack-sm">
                    <p className="muted" style={{ margin: 0 }}>
                      {company.payment_instructions}
                    </p>
                    {company.bank_name ? (
                      <p className="hint" style={{ margin: 0 }}>
                        Bank: {company.bank_name}
                        {company.bank_branch ? ` — ${company.bank_branch}` : ''}
                        <br />
                        Account name: {company.bank_account_name}
                        <br />
                        Account: {company.bank_account_number}
                      </p>
                    ) : null}
                    {company.mobile_money_number ? (
                      <p className="hint" style={{ margin: 0 }}>
                        Mobile money: {company.mobile_money_number}
                      </p>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              <Callout>
                <Star size={17} />
                <span>
                  Already have an account?{' '}
                  <Button to="/login" variant="link" size="sm">
                    Sign in
                  </Button>{' '}
                  to follow your payments and documents, or message the team directly.
                </span>
              </Callout>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
