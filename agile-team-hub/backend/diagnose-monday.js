// diagnose-monday.js — run with: node diagnose-monday.js
// Prints all column IDs for all 5 ATH boards so you can update monday.ts
require('dotenv/config');
const { GraphQLClient } = require('graphql-request');

const client = new GraphQLClient('https://api.monday.com/v2', {
  headers: {
    Authorization: process.env.MONDAY_API_TOKEN,
    'API-Version': process.env.MONDAY_API_VERSION || '2024-10',
    'Content-Type': 'application/json'
  }
});

const BOARDS = {
  'ATH — Iteraciones':   process.env.MONDAY_ITERATIONS_BOARD_ID,
  'ATH — Sesiones':      process.env.MONDAY_SESSIONS_BOARD_ID,
  'ATH — Bloqueantes':   process.env.MONDAY_BLOCKERS_BOARD_ID,
  'ATH — Showcase':      process.env.MONDAY_SHOWCASE_BOARD_ID,
  'ATH — Retrospectiva': process.env.MONDAY_RETRO_BOARD_ID,
};

async function diagnoseBoard(name, boardId) {
  const query = `
    query {
      boards(ids: [${boardId}]) {
        id name
        columns { id title type }
        items_page(limit: 5) {
          items { id name column_values { id text } }
        }
      }
    }
  `;
  const data = await client.request(query);
  const board = data.boards[0];
  console.log(`\n${'='.repeat(60)}`);
  console.log(`BOARD: ${board.name}  (ID: ${board.id})`);
  console.log(`${'='.repeat(60)}`);
  console.log('COLUMNS:');
  board.columns.forEach(c => console.log(`  ${c.id.padEnd(28)} | ${c.title.padEnd(30)} | ${c.type}`));
  const items = board.items_page.items;
  if (items.length > 0) {
    console.log(`\nSAMPLE ITEMS (${items.length}):`);
    items.forEach(item => {
      console.log(`\n  "${item.name}" (id: ${item.id})`);
      item.column_values.forEach(c => { if (c.text) console.log(`    ${c.id.padEnd(28)} = "${c.text}"`); });
    });
  } else {
    console.log('\n  (no items yet)');
  }
}

async function run() {
  console.log('Monday API token configured:', Boolean(process.env.MONDAY_API_TOKEN));
  for (const [name, id] of Object.entries(BOARDS)) {
    if (!id) { console.log(`\nSKIPPED ${name}: board ID not set in .env`); continue; }
    try {
      await diagnoseBoard(name, id);
    } catch (err) {
      console.error(`ERROR on ${name}:`, err.message);
    }
  }
}

run();
