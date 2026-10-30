# Build feedback

## Nebius Token Factory

The application is configured to use `https://api.tokenfactory.nebius.com/v1/` and takes its credential from `NEBIUS_API_KEY`. During this build, an explicitly authorized request to the documented `/models` endpoint returned HTTP 401. That is the only observed provider outcome here: model availability and live inference remain unverified. The interface now distinguishes configured credentials from a successful connection and does not infer IDs from the failed listing.

## NVIDIA Nemotron

The app is configured to route its chat and extraction calls through Nebius Token Factory. A successful Nemotron response was not observed during this build, so no latency, quality, or comparative performance claims are made.

## NVIDIA tooling

No NVIDIA-hosted endpoint was used for inference during this build. Earlier UI wording that suggested NVIDIA NIM was removed so the provider path matches the code.

## Tavily

The code supports optional Tavily search and source checks. No live Tavily result was measured as part of this build; availability depends on the user’s configured key and network access.
