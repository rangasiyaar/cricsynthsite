Empty on purpose: the "api" Hosting site forwards every request to the cricapi Cloud Run
service, so API traffic is served through Firebase Hosting's CDN rather than directly
from Cloud Run (whose free outbound transfer is only 1 GB a month).
