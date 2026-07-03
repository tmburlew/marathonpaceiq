#!/bin/bash
# Run this from inside the MarathonIQ folder:  bash commit_to_github.sh
set -e

# 1. Remove the leftover duplicate folder (safe to skip if you already deleted it)
rm -rf "strava-race-predictor 2"

# 2. Init git (no-op if already a repo)
git init

# 3. Stage and commit
git add .
git commit -m "Initial commit: PaceIQ race predictor"

# 4. Create the GitHub repo and push
#    Option A - GitHub CLI (recommended, run "gh auth login" first if needed):
gh repo create MarathonIQ --public --source=. --remote=origin --push

#    Option B - no gh CLI: create an empty repo named "MarathonIQ" on github.com first,
#    then comment out the "gh repo create" line above and run instead:
# git branch -M main
# git remote add origin https://github.com/<your-username>/MarathonIQ.git
# git push -u origin main
