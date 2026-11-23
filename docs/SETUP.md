# Connecting the services

Cadence works with none of these. Each one adds something, and each step
below is done in a web browser. No coding needed.

| Service | What it adds | Cost | Needs first |
| --- | --- | --- | --- |
| [Sentry](#1-sentry--error-reports) | Tells you when the app breaks for someone | Free plan | Nothing |
| [UptimeRobot](#2-uptimerobot--outage-alerts) | Emails you within minutes if the site goes down | Free plan | Nothing |
| [Cloudflare](#3-cloudflare--your-own-web-address) | Your own address, like `fit.yourname.com` | Free account; the domain costs a yearly fee | Nothing |
| [Resend](#4-resend--sign-in-emails) | Sends sign-up and sign-in emails | Free plan | A domain (step 3) |
| [Supabase](#5-supabase--accounts-and-cloud-sync) | Accounts, cloud backup and sync between devices | Free plan | Resend (step 4), if anyone other than you will sign up |

Where this guide says **GitHub settings**, it means:
**github.com/jjcode88/Tester1 → Settings → Secrets and variables → Actions**.
That page has two tabs:

- **Variables**: settings that are fine to be public.
- **Secrets**: passwords. Once saved, nobody can read them back, not even you.

Where it says **re-publish**, it means: **Actions tab → CI → Run workflow →
Run workflow**. That rebuilds the site with your new settings (about 5 minutes).

---

## 1. Sentry · error reports

1. Go to **sentry.io** and sign up (choosing *Continue with GitHub* is quickest).
2. Create a project: platform **React**, name `cadence`.
3. On the setup page, ignore the code and copy the **DSN**: a web address like
   `https://abc123@o456.ingest.sentry.io/789`.
   Lost it? **Settings → Projects → cadence → Client Keys (DSN)**.
4. In **GitHub settings → Variables**, add `SENTRY_DSN` with that value.
5. Re-publish.
6. Check: open the app's **Status** page, press **Send a test error**, and it
   appears in Sentry under **Issues** within a minute.

*Optional, for readable error locations:* in Sentry create an
**Organization Auth Token**, then add the secret `SENTRY_AUTH_TOKEN` and the
variables `SENTRY_ORG` (your organisation's short name) and `SENTRY_PROJECT`
(`cadence`).

## 2. UptimeRobot · outage alerts

The project already checks itself every 15 minutes from GitHub. UptimeRobot
checks from outside GitHub, every 5 minutes, and emails or texts you.

1. Go to **uptimerobot.com** and sign up.
2. **New monitor** → type **Keyword**.
3. URL: `https://jjcode88.github.io/Tester1/health.json`
   (or your own address from step 3, followed by `/health.json`).
4. Keyword: `cadence`, and choose **alert when the keyword does not exist**.
   That way an error page still counts as down.
5. Interval: **5 minutes**. Leave your email ticked as the alert contact.
6. Save. *Optional:* **Status pages → New** gives you a public "is it up?" page.

## 3. Cloudflare · your own web address

A web address (domain) is rented by the year. Cloudflare sells them at cost;
the price depends on the ending (`.com`, `.app` …) and is shown before you pay.

1. Go to **cloudflare.com** and sign up.
2. **Domain Registration → Register Domains**, search for a name and buy it.
3. Open the domain → **DNS → Records → Add record**:
   - Type: **CNAME**
   - Name: `fit` (this makes `fit.yourdomain.com`; pick any word)
   - Target: `jjcode88.github.io`
   - Proxy status: switch it **off** (grey cloud, "DNS only"). GitHub can't
     issue the padlock certificate otherwise.
   - Save.
4. In GitHub: **Settings → Pages → Custom domain**, type `fit.yourdomain.com`, **Save**.
5. Wait for the green "DNS check successful", then tick **Enforce HTTPS**.
   The certificate can take up to an hour. If it gets stuck, remove the
   domain, save, and add it again.

The uptime monitor follows the new address automatically. Update UptimeRobot
(step 2) and Supabase's Site URL (step 5) to the new address too.

## 4. Resend · sign-in emails

Supabase's own email service only sends to you and your team, about 2 an hour.
To send sign-up and sign-in emails to everyone else, Supabase needs an email
service like Resend. The free plan covers 100 emails a day.

1. Go to **resend.com** and sign up.
2. **Domains → Add domain**: enter your domain from step 3.
3. Resend lists a few DNS records. If it offers to add them to Cloudflare for
   you, accept. Otherwise add each one in **Cloudflare → DNS → Records**,
   copying the type, name and value exactly.
4. Wait until the domain shows **Verified** (usually minutes).
5. Connect it to Supabase (after step 5 below). Either:
   - in Resend, use the **Supabase integration**, which fills Supabase's
     settings in for you, or
   - in Supabase, **Project Settings → Authentication → SMTP Settings →
     Enable custom SMTP**, and copy the values from Resend's **SMTP** page:
     host `smtp.resend.com`, port `465`, username `resend`, password = a
     Resend **API key**. Sender email: something like `hello@yourdomain.com`.

## 5. Supabase · accounts and cloud sync

1. Go to **supabase.com**, sign in with GitHub, **New project**:
   - Name `cadence`, region closest to you.
   - **Generate a password and save it in your password manager.** You need it below.
2. Wait about 2 minutes for it to start.
3. Press **Connect** at the top of the project:
   - Under **App frameworks** (or **API keys**), copy the **Project URL** and
     the **anon / publishable key**.
   - Under **Connection string → Session pooler**, copy the address and put
     your database password where it says `[YOUR-PASSWORD]`.
     Use **Session pooler**: the "Direct connection" address can't be reached
     from GitHub.
4. In **GitHub settings**:
   - **Variables**: `SUPABASE_URL` = Project URL, `SUPABASE_ANON_KEY` = the key.
   - **Secrets**: `SUPABASE_DB_URL` = the Session pooler address with your password in it.
5. In Supabase, **Authentication → URL Configuration**:
   - **Site URL**: `https://jjcode88.github.io/Tester1/` (or your own address)
   - **Redirect URLs**: add the same address.
6. Re-publish. The workflow creates the database tables, then publishes the
   site with sign-in switched on.
7. Check: the app's **Account** page now offers **Sign in / Create account**,
   and the **Status** page shows Supabase as **Operational**.

Free projects pause after a week with no activity. People can still use the
app and it keeps their workouts on their device, but sign-in and sync stop
until you press **Restore** on the project in Supabase.

---

### Which values are safe to share?

| Value | Safe to be public? |
| --- | --- |
| `SENTRY_DSN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Yes. They're built into the website. The database's security rules decide what the key can do. |
| `SUPABASE_DB_URL`, `SENTRY_AUTH_TOKEN`, Resend API key, database password | **No.** Keep them in GitHub **Secrets** or your password manager only. |
