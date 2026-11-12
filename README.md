# Role Radar

Role Radar is an installable job search app for senior partnerships, business development, LATAM expansion, origination, private credit and investor relations roles. It favors AI and the Miami, Bay Area, Brazil and remote markets. Use Discover to browse, search, filter by industry, work setup, and preferred work location. Save an opening for later or mark it as applied after submitting it with the employer.

## Publish on GitHub

1. Create an empty GitHub repository named `role-radar`. GitHub Free supports Pages for public repositories. Eligible paid plans support private source repositories, with Pages visibility governed by your plan and organization. The app publishes employer listings and generic ranking criteria. Browser tracking stays on your device.
2. Unzip this project and run the commands below inside `role-radar`, replacing `OWNER` with your GitHub login. Authenticate through GitHub CLI or your preferred Git credential setup. Keep the hidden `.github` directory.

   ```sh
   git init -b main
   git add .
   git commit -m "Build Role Radar"
   git remote add origin https://github.com/OWNER/role-radar.git
   git push -u origin main
   ```

3. In **Settings → Pages**, set **Source** to **GitHub Actions**. Open **Actions → Refresh and publish Role Radar → Run workflow**. Once the publish job succeeds, open the deployment URL from the workflow or the Pages settings.
4. On iPhone, open the deployment in Safari, tap **Share → Add to Home Screen**, enable **Open as Web App**, and tap **Add**.

Repository and organization settings must permit the workflow to commit the job feed to the default branch. A default-branch rule that requires pull requests for every update will block that push.

## Refresh and storage

GitHub Actions requests a refresh at **7:17 a.m. Eastern** daily. The **11:43 a.m. Eastern** run retries missed or partial polls and republishes a fresh feed if the first deployment failed. GitHub schedules can be delayed, and GitHub automatically disables scheduled workflows in inactive public repositories after 60 days. Re-enable the workflow from Actions if needed. Manual runs are supported. The in-app refresh button fetches the most recently published feed.

The Python collector reads the public Ashby, Greenhouse and Lever boards in `scripts/sources.json`. Coverage is limited to those employers, with fintech forming the bulk of the finance coverage. It records source failures, keeps the last successful listings for a failed board with a stale marker, and removes closed listings after a successful refresh. When every board fails, the run fails and preserves the previous deployment.

The current feed lives in `app/data/jobs.json` and its history lives in Git. The service worker caches the app and a successfully loaded feed for offline access. Saved and applied states use device-local browser storage and stay on that installation. Clearing website data can remove them. Remote eligibility is often ambiguous, so confirm geography in the employer posting. The match labels reflect transparent title, market and industry signals and are meant to prioritize what to review.

## Prepare applications

Choose **Prepare application** on a role to open its employer URL, copy that URL, and edit a short intro message and a role-specific answer. Add your professional summary, one proof point, and focus areas under **Your application profile** to personalize future drafts. These profile details stay in the current browser's local storage and are not sent to Role Radar. Review every draft for accuracy, then complete and submit the form on the employer's site. The app does not submit applications for you.

The work setup filter can show roles explicitly marked remote, while the work location filter narrows to San Francisco, Miami, or roles in/remote-eligible for Brazil. Employer feeds vary in how they describe remote eligibility; confirm work-from country rules and office expectations in the posting.

## Run locally

```sh
python3 scripts/refresh.py
python3 -m http.server 8000 --directory app
```

Open http://localhost:8000. Python 3.10+ and a system time-zone database are sufficient. The frontend is plain HTML, CSS and JavaScript.
