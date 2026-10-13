const policyCopy = {
  privacy: {
    title: 'Privacy policy — draft for owner approval',
    body: 'This draft must be reviewed and approved by the business owner before publication. The website is intended to let visitors browse products and start an enquiry on WhatsApp. The approved policy must describe any actual data processing and applicable contact channels.',
  },
  terms: {
    title: 'Terms of use — draft for owner approval',
    body: 'This draft is not a final business policy. Product availability, price, delivery, and acceptance must be confirmed by the owner through WhatsApp before any order is accepted.',
  },
  shipping: {
    title: 'Shipping and delivery — draft for owner approval',
    body: 'Shipping locations, charges, delivery times, and handling practices have not been supplied. The business owner must approve this information before the page is treated as a customer-facing policy.',
  },
  returns: {
    title: 'Returns and refunds — draft for owner approval',
    body: 'Returns and refund terms have not been supplied. The business owner must provide and approve wording consistent with applicable consumer requirements before publication.',
  },
}

export default function PolicyPage({ type }) {
  const policy = policyCopy[type]
  return (
    <section className="page-width section policy-page">
      <p className="eyebrow">Draft information</p>
      <h1>{policy.title}</h1>
      <p>{policy.body}</p>
    </section>
  )
}
