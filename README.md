# The Motion Desk

The Motion Desk is an independent creative complex with three active wings: **The Gazette**, **The Perspective**, and **The Desk**.

## Participation model

**The Gazette** is an editor-led public archive. It is written, shaped, and published by Shaurya Seth and Aadya Mishra. Its public interface intentionally has no pitch or open-submission route.

**The Perspective** is a people-first writing room. Anyone can begin writing immediately and publish under a chosen display name or pseudonym. A writer’s email is used only for account access and is never shown in the public feed. The public feed has a report link, and users with the `admin` or `editor` Netlify Identity role can remove a post.

## Netlify setup for Perspective publishing

The repository includes a Netlify Function at `netlify/functions/perspective-posts.mjs` and stores published pieces in the site’s `perspective-posts` Netlify Blobs store.

1. In the Netlify site dashboard, enable **Identity**.
2. Enable email/password registration. Google login can be enabled from Identity’s external providers if desired.
3. In Identity settings, set registration to **Open** so readers can create accounts when they publish.
4. Add Shaurya and Aadya as Identity users and give each the `admin` role, or give them the `editor` role if they should moderate Perspective posts without broader site administration.
5. Redeploy the site so Netlify installs the dependencies in `package.json` and discovers the Function.

The first public post initializes the Netlify Blobs namespace automatically. The Function validates display name, title, and body length, stores only the user ID rather than the user’s email, and exposes only published content through the public feed.

## Local checks

The main site is a static HTML experience. Serverless behavior is provided by Netlify Functions and is fully exercised after deployment on the Netlify site URL. Before pushing changes, run:

```bash
node --check netlify/functions/perspective-posts.mjs
git diff --check
```
