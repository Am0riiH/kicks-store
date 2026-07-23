const db = require('./db.js');

async function run() {
  db.init(); // note: async but in this context just load
  setTimeout(() => {
    // Set variant 1 to qty 2
    console.log('--- Setting Variant 1 to qty 2 ---');
    db.updateVariant(1, { ...db.getVariant(1), quantity: 2 });
    console.log('Variant 1 Qty:', db.getVariant(1).quantity);

    // Test DB Guard (Layer 3)
    console.log('\n--- Testing DB Guard (Decrementing 3 from 2) ---');
    const success = db.decrementVariantQuantity(1, 3);
    console.log('Decrement success:', success);
    console.log('Variant 1 Qty after failed decrement:', db.getVariant(1).quantity);

    // Test successful decrement (Decrementing 1 from 2)
    console.log('\n--- Testing DB Guard (Decrementing 1 from 2) ---');
    const success2 = db.decrementVariantQuantity(1, 1);
    console.log('Decrement success:', success2);
    console.log('Variant 1 Qty after successful decrement:', db.getVariant(1).quantity);

  }, 1000);
}

run();
