# How much Mozart has Jade listened to?
Great question! This year, I'm listening to every Mozart work! I made a twitter bot that tweets every time I listen to a new one,
along with the total percentage of his works that I've listened to. I started the bot on Monday, November 18th 2019, 
so everything will be from that point on. This script checks my recent tracks on Spotify every minute and uses a
regex pattern to extract the catalogue numbers from the Mozart tracks. From there, it checks a PostgreSQL database
that contains every Mozart work (scraped from the [Köchel catalogue Wikipedia page](https://en.wikipedia.org/wiki/Köchel_catalogue))
and writes any new tracks to the database and sends a tweet. 
