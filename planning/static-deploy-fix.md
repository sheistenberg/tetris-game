# Static Deploy Fix

## Goal

Make the `tetris-game` repository deploy correctly on Servyn so the
`tetris-game.nexrahq.com` domain serves the actual game instead of the default
Nginx welcome page.

## Scope

- Add an explicit container build for this static site.
- Serve the repo's static assets from Nginx.
- Add a committed Servyn deployment blueprint at `.servyn/project.json`.
- Do not change gameplay, UI behavior, or application logic.

## Files To Modify

- `Dockerfile`
  - Use a minimal Nginx image and copy the site's static assets into the web root.
- `nginx.conf`
  - Configure Nginx to serve `index.html` as the default document for the site.
- `.servyn/project.json`
  - Declare Servyn app `tetris-game`, point `dockerfilePath` at `Dockerfile`,
    and include the production domain `tetris-game.nexrahq.com`.

## Constraints

- Keep the implementation minimal and production-safe.
- Do not add app runtime dependencies or a Node build step.
- Do not modify `index.html`, `script.js`, `style.css`, or gameplay code.

## Verification

- Build the container locally if practical.
- Confirm the container serves `index.html` from Nginx rather than the default
  welcome page.
- Ensure `.servyn/project.json` is valid JSON and matches the Servyn schema
  shape for version `1`.
