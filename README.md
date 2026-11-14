# Chaos & Candy

A browser-based social club with editable avatar profiles, shared text chat, online presence, and six-person voice rooms.

## Deploy from GitHub to Vercel

1. Extract `chaos-and-candy.zip`. Create a GitHub repository and upload the **contents** of the extracted folder, so `package.json` and `app/` are at the repository root. Include `.gitignore` and `.env.example`. Keep real credentials out of GitHub.
2. Create a **libSQL database** in [Turso](https://turso.tech/). Copy its database URL and create a database auth token with write access.
3. Install Node.js **24** on your computer. In the extracted project folder, copy `.env.example` to `.env.local` and fill in the required values listed below. Run `npm ci` and then `npm run db:setup`. This initializes the Turso database when its URL is set. It is safe to rerun. As an alternative, apply `db/schema.sql` to the Turso database using the Turso CLI or SQL console.
4. In [Vercel](https://vercel.com/new), choose **Add New → Project**, import the GitHub repo, and select **Next.js**. Use the repository root and the default build command. Add the same required values under **Environment Variables**, then deploy.
5. Open the deployment and select **Sign in → New here? Create an account**. Enter your email, then open the verification link and choose a username and password. The link expires after 30 minutes and can only create one account.

| Variable | Value |
| --- | --- |
| `SESSION_SECRET` | A random secret of at least 32 characters. Generate it with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. |
| `APP_URL` | Your canonical HTTPS site URL, for example `https://candy-chaos-club.vercel.app`. |
| `AUTH_FROM_EMAIL` | Sender address on a domain you verified in [Resend](https://resend.com/domains), for example `Chaos & Candy <accounts@yourdomain.com>`. |
| `RESEND_API_KEY` | A sending-access key for your verified sender domain. |
| `TURSO_DATABASE_URL` | The Turso libSQL database URL, typically beginning with `libsql://`. |
| `TURSO_AUTH_TOKEN` | A write-enabled token for that database. |

This deployment starts with a fresh database and uses its own member accounts. The earlier ChatGPT-hosted club’s accounts, chats, and rooms are outside this export.

## Run on your computer

Leave the two Turso values blank in `.env.local` to use a local SQLite database. Set `SESSION_SECRET`. To test signup with real email, also set the Resend values and `APP_URL=http://localhost:3000`. Then run:

```bash
npm ci
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Local SQLite data is stored in `.local/club.sqlite`.

## Voice rooms

Open the deployed site in a browser tab, enter the same voice room on two accounts, choose **Join voice**, and grant microphone access. Use headphones during the test to avoid feedback. The default configuration attempts a direct WebRTC connection. If participants on different networks cannot hear one another, configure `TURN_URLS` (comma-separated relay URLs), `TURN_USERNAME`, and `TURN_CREDENTIAL` in Vercel and redeploy. Use relay credentials scoped to this app because authenticated browsers receive them when they join voice.

## Updating an existing Chaos & Candy deployment

1. Keep your existing Turso database and Vercel environment variables. In your local copy of the updated project, point `.env.local` at that database and run `npm run db:setup`, or apply the `CREATE TABLE IF NOT EXISTS club_floor` and `CREATE INDEX IF NOT EXISTS club_floor_seen` statements at the end of `db/schema.sql`. This adds the avatar floor to the same database and preserves accounts, profiles, rooms, and chat history.
2. Copy the contents of this ZIP's `chaos-and-candy` folder into the root of your existing GitHub project. Keep your private environment file out of the commit. Commit to the branch your Vercel project deploys.
3. Open **Main Chat** to post, **Club Floor** to move and emote, **Members** to search profiles, and **My Profile** to edit your avatar. Join voice explicitly from a voice channel. You can browse the club while voice stays connected, and disconnect using the controls under the channel list.

## Upgrade from invite-code registration

1. Keep your existing Turso database and session secret. Run `npm run db:setup` against that database before pushing this update. The setup adds signup, verified-account, and session tables without deleting existing accounts.
2. In Vercel, set `APP_URL`, `AUTH_FROM_EMAIL`, and `RESEND_API_KEY`. Verify your sender domain in Resend and keep click tracking disabled for verification emails so the link goes directly to your site. Remove the retired `CLUB_INVITE_CODE` variable.
3. Commit the extracted project files and redeploy. Existing users sign in again with the same username and password. Their IDs, profiles, and rooms are preserved. Legacy accounts have no verified email. Password recovery, verification for legacy accounts, and payments are outside this release.
4. On the deployed URL, do a test signup with a real inbox. Check delivery, complete signup, sign out, and sign in with the new credentials.
