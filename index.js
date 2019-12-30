require('dotenv').config()
const to = require('await-to-js').default;
const Spotify = require('spotify-web-api-node');
const { Client } = require('pg');
const restify = require('restify');
const Twitter = require('twitter');
const kochel = require('./kochel.json');

const { clientId, clientSecret, redirectUri } = process.env;

const api = new Spotify({
  clientId,
  clientSecret,
  redirectUri,
});

// database setup
const client = new Client()

const twitter = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

const getRecentMozart = async () => {
  // get recently played tracks from spotify
  const [err, tracks] = await to(api.getMyRecentlyPlayedTracks());
  if (err) return console.error(err);
  // extract track names and artists from more complex track object
  const tracksSimple = tracks.body.items.map(({track}) => ({ 
    name: track.name, 
    artists: track.artists.map(a => a.name) 
  }));
  // filter out all tracks that Mozart isn't an artist in
  const mozartTracks = tracksSimple.filter(t => {
    if (t.artists.indexOf('Wolfgang Amadeus Mozart') > -1) return true;
  });
  // if we haven't listened to any mozart recently, stop execution
  if (mozartTracks.length === 0) return true;
  // create array of just track names
  const mozartTrackNames = mozartTracks.map(t => t.name);
  // extract kochel catalogue numbers from track names
  const pattern = /KV?\.?\s?((App|Anh|Anhang)?\.?\s?([0-9]+[a-zA-Z]*))/;
  const catNoUntransformedUnfiltered = mozartTrackNames.map(t => t.match(pattern));
  const catNoUntransformedWholeObject = catNoUntransformedUnfiltered.filter(t => (t !== null) ? true : false);
  const catNoUntransformed = catNoUntransformedWholeObject.map(t => t[1]);
  // transform various Anhang forms into "Anh. "
  const catNoAnhTrans = catNoUntransformed.map(t => t.replace(/(Anhang|App)/, 'Anh'));
  // make sure every "Anh" is followed by a period and then a whitespace
  const catNo = catNoAnhTrans.map(t => t.replace(/(Anh\s|Anh\.(?=[0-9]))/, 'Anh. '));
  // search catalogue for matches, get K6 catalogue numbers 
  // (since every track has a K6 number, but not all have K1 numbers)
  const k1 = kochel.map(c => c.K1);
  const k6 = kochel.map(c => c.K6);
  // a lot of works have K1 listed first, so search for K1 first
  const k1matches = catNo.map(n => k1.find((e) => {
    if (e.indexOf(n) > -1) return e;
  }))
  const k6matches = catNo.map(n => k6.find((e) => {
    if (e.indexOf(n) > -1) return e;
  }))
  // combine search results. if there are matches for k1 and k6, use k1
  // some works have complete matches for k1 and partial, incorrect matches for k6
  // eg K. 299 (Concerto for Flute and Harp in C) is a partial match for
  // K6 works 299a-d (several completely different works)
  // once we find correct K1 number, THEN find the K6 number
  const matches = k1matches.map((m, i) => {
    // get matching K6 numbers from K1 numbers
    if (m !== undefined) {
      const { K6 } = kochel.find((c) => {
        if (c.K1 === m) return true;
      });
      return K6;
    } else return k6matches[i];
  });
  return matches;
}

const getPercentTotalListned = async (client) => {
  // calculate % of total works that I've listened to
  const query = 'SELECT ROUND(cast(count(CASE WHEN listened_to THEN 1 END) as decimal) / cast(count(*) as decimal) * 100, 1) AS percent FROM mozart';
  const [err, res] = await to(client.query(query));
  if (err) return console.error(err);
  const percentTotalListened = res.rows[0].percent;
  return percentTotalListened;
};

const checkNew = async (works) => {
  // if no new works, stop execution
  if (works === true) return true;
  // search db for each catalogue number
  const [err, matchingWorks] = await to(Promise.all(
    works.map(async (w) => {
      const query = 'SELECT id, title, listened_to FROM mozart WHERE id = $1';
      const res = await client.query(query, [w]);
      return res.rows[0];
    })
  ));
  if (err) return console.error(err);
  // check to see if they have been listened to
  // if not, set them to true and tweet about it!
  const [matchingWorksErr, totalNewWorksArr] = await to(Promise.all(
    matchingWorks.map(async (w) => {
      if (w.listened_to === false) {
        const query = 'UPDATE mozart SET listened_to = true, listened_at = $1 WHERE id = $2';
        const res = await client.query(query, [new Date(), w.id]);
        const percentTotalListened = await getPercentTotalListned(client);
        const words = ['Hark!', 'Rejoyce!', 'Alleluia!', 'Nice!', 'Pretty swish!', 'Terrific!', 'Absolutely!', 'So fetch!', 'Radical!', 'Wow-wee!', 'Good morning! Let\'s begin—', 'YOLO!', 'So...'];
        const word = words[Math.floor(Math.random() * words.length)];
        const status = `${word} @quincelikefruit just listened to K. ${w.id}: ${w.title}. She has listened to ${percentTotalListened}% of Mozart's total works.`;
        const twitterRes = await twitter.post('statuses/update', { status })
        console.log(`success! tweet string: ${twitterRes.text}`);
        return 1;
      } else return 0;
    })
  ));
  if (matchingWorksErr) return console.error(err);
  // stop the function
  const totalNewWorks = totalNewWorksArr.reduce((a, b) => a + b, 0)
  console.log(`${totalNewWorks} new works listened to`);
};

// auth callback handling
const handleCallback = async (req, res, next) => {
  // acknowlege request
  res.send('ok!');
  next();
  // get tokens from callback code
  const code = req.query.code;
  await auth(code);
};

let serverListening = false;
const server = restify.createServer();
server.use(restify.plugins.queryParser());
server.get('/callback', handleCallback);

client.connect();

const auth = async (code) => {
  const data = await api.authorizationCodeGrant(code);
  const { expires_in, access_token, refresh_token } = data.body; 

  // we won't need any further authorizations , so we can close the server
  // since we have the refresh token
  server.close();
  serverListening = false;

  // store tokens in database
  const expires_at = new Date();
  expires_at.setSeconds(expires_at.getSeconds() + expires_in);
  const res = await client.query('INSERT INTO "public"."auth"("access_token", "refresh_token", "expires_at") VALUES($1, $2, $3) RETURNING "id", "access_token", "refresh_token", "expires_at"', [access_token, refresh_token, expires_at]);
  console.log('success! auth token stored in db');

  // Set the access token on the API object to use it in later calls
  api.setAccessToken(access_token);
  api.setRefreshToken(refresh_token);
  loop();
};

const refresh = async () => {
  // use refresh token to get a new access token
  const data = await api.refreshAccessToken();
  const { expires_in, access_token, refresh_token } = data.body; 
  // spotify may or may not give us a new refresh token
  // we need two different update functions based on whether it does or doesn't
  if (refresh_token !== undefined) {
    const expires_at = new Date();
    expires_at.setSeconds(expires_at.getSeconds() + expires_in);
    // probably okay to just use id=1 since this is only meant for one user (me, haha)
    const res = await client.query('UPDATE "public"."auth" SET "access_token"=$1, "refresh_token"=$2, "expires_at"=$3 WHERE "id"=1 RETURNING "id", "access_token", "refresh_token", "expires_at";', [access_token, refresh_token, expires_at]);
    console.log('success! new auth and refresh token stored in db');
    api.setRefreshToken(refresh_token);
  } else {
    // same thing as previous block but does not update refresh token
    const expires_at = new Date();
    expires_at.setSeconds(expires_at.getSeconds() + expires_in);
    const res = await client.query('UPDATE "public"."auth" SET "access_token"=$1, "expires_at"=$2 WHERE "id"=1 RETURNING "id", "access_token", "refresh_token", "expires_at";', [access_token, expires_at]);
    console.log('success! new auth token stored in db');
  }
  api.setAccessToken(access_token);
};


const interval = 60000;

// event loop runs every x minutes or after authorization callback has been run
const loop = async () => {
  // check db for existing tokens
  const { rows } = await client.query('SELECT access_token, refresh_token, expires_at FROM auth FETCH FIRST ROW ONLY');
  // if there aren't any tokens, log auth url to console and open server
  if (rows.length === 0 && serverListening === false) {
    return server.listen(3000, () => {
      const scopes = ['user-read-recently-played'];
      const state = 'testing';
      const authURL = api.createAuthorizeURL(scopes, state);
      console.log(`auth needed! ${authURL}`);
      serverListening = true;
    });
  } else if (serverListening) return false;
  const { expires_at, access_token, refresh_token } = rows[0];
  api.setAccessToken(access_token);
  api.setRefreshToken(refresh_token);
  // if the tokens are expired, refresh them
  if (expires_at < new Date()) {
    const [err] = await to(refresh());
    if (err) return console.error(err);
  }
  // await refresh();
  // refresh tokens if needed
  // check tracks, tweet, etc.
  const works = await getRecentMozart();
  await checkNew(works);
}

loop();
setInterval(loop, interval);
