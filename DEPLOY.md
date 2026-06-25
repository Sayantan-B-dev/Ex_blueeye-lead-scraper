# Deployment — Method 2 (gosom Docker) to Cloud VM

Step-by-step from your **local machine** to a **cloud VM** and back.

---

## Prerequisites

- Your project is at: `G:\code\Web techs\projects\BlueEye\scraping_info`
- You have SSH access to a cloud VM (Oracle ARM, Hetzner, etc.)
- Docker is installed on the VM (see below)

---

## Step 1: Create a VM

### Oracle ARM (Free)

1. Sign up at [cloud.oracle.com](https://cloud.oracle.com)
2. Create VM: **Ubuntu 22.04**, Shape **VM.Standard.A1.Flex**, 4 OCPUs, 24 GB RAM
3. Add your SSH public key, open port 22
4. Note the public IP

### Hetzner (~$0.35)

1. Sign up at [hetzner.cloud](https://hetzner.cloud)
2. Create server: **Ubuntu 22.04**, **CX32** (4 vCPU, 8 GB)
3. Add your SSH key
4. Note the IP

---

## Step 2: Install Docker on the VM

```bash
# From your local machine — SSH into the VM
ssh ubuntu@<vm-ip>          # Oracle
ssh root@<vm-ip>            # Hetzner

# Install Docker
sudo apt update && sudo apt install -y docker.io tmux
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# Exit and reconnect for group to take effect
exit
ssh ubuntu@<vm-ip>          # reconnect
docker --version            # verify
```

---

## Step 3: Upload method2 to the VM

**From your local machine** (Git Bash, PowerShell, or CMD):

```bash
# Git Bash — upload the entire method2 folder
scp -r "G:/code/Web techs/projects/BlueEye/scraping_info/method2" ubuntu@<vm-ip>:~/
```

For large transfers, use `rsync` (faster, shows progress, resume-capable):

```bash
# Git Bash
rsync -avz --progress "G:/code/Web techs/projects/BlueEye/scraping_info/method2/" ubuntu@<vm-ip>:~/method2/
```

> **Windows CMD note:** If using CMD/PowerShell, replace the path with:
> ```cmd
> scp -r "G:\code\Web techs\projects\BlueEye\scraping_info\method2" ubuntu@<vm-ip>:~/
> ```

---

## Step 4: Pull the Docker Image

```bash
ssh ubuntu@<vm-ip>

# One-time pull (takes ~1-2 min)
docker pull gosom/google-maps-scraper

# Verify
docker images | grep google-maps
```

---

## Step 5: Run the Scraper (with tmux)

```bash
# Start a tmux session so it keeps running after you disconnect
tmux new -s scrape

# Go to the project
cd ~/method2

# Make run.sh executable
chmod +x run.sh

# Run — 3 parallel Docker containers by default
./run.sh

# Or adjust concurrency:
./run.sh --concurrent 2       # lighter on CPU
./run.sh --concurrent 4       # faster if CPU/bandwidth allows
```

**Tmux controls:**
- **Detach** (leave running): `Ctrl+B` then `D`
- **Reattach** (check progress): `tmux attach -t scrape`
- **List sessions**: `tmux ls`

---

## Step 6: Monitor Progress

While the scraper runs, you can check:

```bash
# See live output (without reattaching tmux)
tail -f ~/method2/logs/*.log

# Check CSV sizes growing
watch -n 10 'wc -l ~/method2/output/*.csv'

# Check CPU/memory
htop
```

---

## Step 7: Download Results

**After the scraper finishes**, from your local machine:

```bash
# Download all batch CSVs
scp ubuntu@<vm-ip>:~/method2/output/batch_*.csv "G:/code/Web techs/projects/BlueEye/scraping_info/method2/output/"

# Also download logs
scp ubuntu@<vm-ip>:~/method2/logs/*.log "G:/code/Web techs/projects/BlueEye/scraping_info/method2/logs/"
```

Or merge on the VM first, then download just the final file:

```bash
# On the VM
cd ~/method2
python3 merge.py    # creates final.csv

# Back on local machine
scp ubuntu@<vm-ip>:~/method2/final.csv "G:/code/Web techs/projects/BlueEye/scraping_info/method2/"
```

---

## Step 8: Merge Locally

After downloading CSVs, merge on your machine:

```bash
cd "G:/code/Web techs/projects/BlueEye/scraping_info/method2"
python merge.py --pattern "output/batch_*.csv" --output final.csv
```

Open `method2/view.html` in a browser and drag `final.csv` to browse leads.

---

## Resume After Interruption

If the scraper is interrupted mid-run (e.g., VM restart):

```bash
ssh ubuntu@<vm-ip>
cd ~/method2
tmux new -s scrape

# Just rerun — it skips completed batches automatically
./run.sh
```

To kill a stuck container:
```bash
docker kill $(docker ps -q)
```

---

## Full Command Summary

```bash
# === LOCAL MACHINE ===

# Upload
scp -r "G:/code/Web techs/projects/BlueEye/scraping_info/method2" ubuntu@<vm-ip>:~/

# === VM ===

# Install Docker + tmux
sudo apt install -y docker.io tmux
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
exit  # reconnect

# Pull image
docker pull gosom/google-maps-scraper

# Run
tmux new -s scrape
cd ~/method2 && chmod +x run.sh && ./run.sh
# Ctrl+B, D to detach

# === LOCAL MACHINE (after done) ===

# Download
scp ubuntu@<vm-ip>:~/method2/output/batch_*.csv "G:/code/Web techs/projects/BlueEye/scraping_info/method2/output/"

# Merge
cd "G:/code/Web techs/projects/BlueEye/scraping_info/method2"
python merge.py
```

---

## VM Cleanup

### Oracle (free, keep forever)
No action needed — ARM instances are always free.

### Hetzner (paid)
Delete the server in Hetzner dashboard to stop billing.
