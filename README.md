# How much Mozart has Jade listened to?
Great question! This year, I'm listening to every Mozart work! I made a Twitter bot that tweets every time I listen to a new one,
along with the total percentage of his works that I've listened to. I started the bot on Monday, November 18th 2019, 
so everything will is from that date and onwards. 
## How it works
1. First, I use `spotify-web-api-node'` to check my recently listened tracks on Spotify. The `getMyRecentlyPlayedTracks` method returns an array of a couple of tracks with a bunch of Spotify metadata. I remove most of the metadata, since I only need the track name and the artists array. Then, I filter the tracks by checking to see if the artists array contains
"Wolfgang Amadeus Mozart".
2. Then, I use a regex pattern to match the Kochel catalog nubmers in every Mozart work. The [Köchel catalog](https://en.wikipedia.org/wiki/Köchel_catalogue) is a catalogue of every Mozart work compiled by Ludwig von Köchel in 1862. There are several versions of the Köchel catalog. K1 was the first version of the catalog, but it was not easily expandable and a number of additional works were discovered and attributed to Mozart since the creation of K1. K6 is a widely used modern revision of Köchel's original catalogue. There are also apendicies to the catalog which were called "Anhang"; these are works that were lost or can only be partially attributed to Mozart. There is significant variation in which numbering scheme each recording uses, as well as how Anhang is spelled or abbreviated. Using the regex output, I try to find the K6 catalog number of each work.  This is the regex pattern that I ended up with:
```regex
/KV?\.?\s?((App|Anh|Anhang)?\.?\s?([0-9]+[a-zA-Z]*))/
```
3. Using the K6 numbers, I check a PostgreSQL database of Mozart works. I decided to just use the K6 keys as the database IDs. For tracks that are not included in the K6 system, I used the K1 numbers. However, there are only a handful of these. If the works's `listened_to` value is `FALSE`, I write the timestamp and change the `listened_to` value to `TRUE`. 
4. I also use an SQL query to calculate the percentage of works that have `TRUE` as the `listened_to` value. This divides the works that I've listened to by the total number of rows. 
```sql
SELECT ROUND(100 * count(CASE WHEN listened_to THEN 1 END) / count(*), 0) AS percent FROM mozart;
```
5. Tweeting is done using the `twitter` library and the twitter API. 
6. The whole function runs once per minute using the `setInterval` function. Every time it runs, it also checks the API tokens from Spotify and refreshes them. If there aren't any auth tokens in the database, the app starts a `restify` http server that recieves a callback response from the Spotify authorization flow. 
## Expansion
I would like to also keep track of the recordings I listen to. While keeping track of the total number of works that I've listened to is fun, I usually listen to the same few works over and over. Keeping track of my favorite recordings and new ones that I discover could be a good way to make this project live longer. I think it's fun to have a finite end on the project though—I'm trying to finish by May 2020 (when I finish my undergraduate degree). 
