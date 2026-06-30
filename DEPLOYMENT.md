# Deploying TerraPilot on Alibaba Cloud (ECS)

This guide deploys the TerraPilot backend on **Alibaba Cloud ECS** so the project
has real, verifiable "Proof of Deployment" (a hard hackathon requirement:
*no proof = not eligible*).

---

## 0. Qwen Cloud integration (proof point #1)

TerraPilot calls Qwen Cloud through Alibaba Cloud DashScope's OpenAI-compatible
endpoint. The Base URL is defined in [`src/lib/qwen.ts`](./src/lib/qwen.ts):

```
https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

This is the official Qwen Cloud endpoint listed in the hackathon requirements.
(Token Plan equivalent: `https://token-plan.ap-southeast-1.maus.aliyuncs.com/compatible-mode/v1`.)

---

## 1. Create an ECS instance

Alibaba Cloud Console → **Elastic Compute Service → Instances → Create Instance**.

| Setting | Value |
|---|---|
| Region | **Asia (Singapore) `ap-southeast-1`** (matches the Token Plan region; low latency) |
| Instance type | `ecs.t6-c1m2.large` (2 vCPU / 4 GiB) — enough to build & run |
| Image | **Alibaba Cloud Linux 3.2104 LTS 64-bit** |
| Public IP | Assign a **public IP** (or bind an EIP) — needed to reach the app |
| Security group | Create one; **add an inbound rule: TCP `3000` from `0.0.0.0/0`** (for the demo). Keep SSH `22` for access. For tighter security, restrict `3000` to your office/VPN CIDR. |
| Key pair | Create/reuse a key pair for SSH access |

Launch the instance and wait until its status is **Running**.

---

## 2. Open the Workbench & connect

Console → **ECS → Instances → your instance → Connect → Workbench / Cloud Shell**.
You now have a terminal on the instance.

> This console view (instance = Running) is exactly the screenshot the judges
> want — capture it now and again at the end.

---

## 3. Install Docker

On Alibaba Cloud Linux 3:

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # so you don't need sudo every time
newgrp docker
docker --version
```

---

## 4. Build & run the app

```bash
# clone your public repo
git clone https://github.com/<you>/terrapilot.git
cd terrapilot

# build the container (uses Next.js standalone output — small image)
docker build -t terrapilot .

# run it, passing the Qwen Cloud credentials as runtime env
docker run -d --name terrapilot --restart=always -p 3000:3000 \
  -e QWEN_API_KEY=sk-xxxxxxxx \
  -e QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1 \
  -e QWEN_MODEL=qwen-max \
  terrapilot
```

> Never bake the key into the image. `.dockerignore` excludes `.env*`, so the key
> only lives in the container's runtime environment.

---

## 5. Verify it's running

```bash
# health: page should return HTML (HTTP 200)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/

# live agent: should be 200 with findings + savings
curl -s -X POST http://localhost:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"terraformCode":"resource \"alicloud_instance\" \"x\" { instance_type = \"ecs.r6.4xlarge\" }"}'
```

From a browser, open `http://<PUBLIC-IP>:3000`.

Logs: `docker logs -f terrapilot`.

---

## 6. Capture the proof screenshots

Take **two** screenshots for the submission:

1. **Running resource** — ECS console → Instances, showing your instance with
   status **Running** and its public IP. *(This is the required "Proof of Deployment".)*
2. **Working app** — Workbench/Cloud Shell with the `curl … /api/analyze` call
   returning JSON, **or** the browser showing the live TerraPilot dashboard.

Save them under `docs/proof/` in the repo and link them from the README +
the Devpost submission.

---

## Fallback: deploy without Docker (Node directly)

If Docker misbehaves, run the standalone server directly on the instance:

```bash
# install Node 20 (Alibaba Cloud Linux 3)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

git clone https://github.com/<you>/terrapilot.git && cd terrapilot
npm ci && npm run build
sudo cp -r public .next/standalone/ && sudo cp -r .next/static .next/standalone/.next/

QWEN_API_KEY=sk-xxxxxxxx \
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1 \
QWEN_MODEL=qwen-max \
PORT=3000 HOSTNAME=0.0.0.0 \
nohup node .next/standalone/server.js > terrapilot.log 2>&1 &
```

Then open the security group port `3000` and verify as in step 5.

---

## Notes
- The in-memory proposal store is process-local; it resets if the container restarts.
  Fine for the demo; swap in Redis for persistence later.
- DashScope's intl endpoint is reachable from any Alibaba Cloud region.
- Estimated cost: a `t6-c1m2.large` runs well within the hackathon credits.
