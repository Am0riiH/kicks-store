require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function run() {
  const session_id = 'cs_test_a1qHU8p6fsLpUkKIrm9NnmL70UHBFJr8EofOpWqgFe29pJqJ6w7aOdDwWS';
  const li = await stripe.checkout.sessions.listLineItems(session_id, {
    limit: 100,
    expand: ['data.price.product']
  });
  console.log(JSON.stringify(li.data, null, 2));
}

run().catch(console.error);
