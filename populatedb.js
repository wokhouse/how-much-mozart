const { Client } = require('pg')
const kochel = require('./kochel.json');

const populateDB = async () => {
  const client = new Client()
  await client.connect();
  await Promise.all(
    kochel.map(async (c) => {
      // there is one song that only has a K1 key
      // so if there is no K6 key, use K1
      const key = (c.K6) ? c.K6 : c.K1;
      const title = c.Composition;
      const query = `INSERT INTO "public"."mozart"("id", "title") VALUES($1, $2) RETURNING "id", "title", "listened_to", "listened_at";`
      try {
        const res = await client.query(query, [key, title]);
      } catch (err) {
        console.error(key, title, err);
      }
    })
  );
  await client.end();
}

populateDB();
