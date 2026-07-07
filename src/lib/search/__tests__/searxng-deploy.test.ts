import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const deployScriptPath = path.resolve(process.cwd(), "infra/searxng/deploy.sh");

let tempDir = "";
let fakeBinDir = "";
let logPath = "";
let statePath = "";

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "searxng-deploy-test-"));
  fakeBinDir = path.join(tempDir, "bin");
  logPath = path.join(tempDir, "gcloud.log");
  statePath = path.join(tempDir, "gcloud.state");
  await mkdir(fakeBinDir, { recursive: true });

  await writeFile(
    path.join(fakeBinDir, "gcloud"),
        `#!/usr/bin/env bash
set -euo pipefail

log_file="\${FAKE_GCLOUD_LOG:?}"
state_file="\${FAKE_GCLOUD_STATE:?}"

command="\${1:-}"
shift || true

case "$command" in
  config)
    if [[ "\${1:-}" == "get-value" && "\${2:-}" == "project" ]]; then
      echo "test-project-123"
      exit 0
    fi
    ;;
  compute)
    subcommand="\${1:-}"
    shift || true

    case "$subcommand" in
      instances)
        action="\${1:-}"
        shift || true

        case "$action" in
          describe)
            zone=""
            format=""
            for arg in "$@"; do
              case "$arg" in
                --zone=*) zone="\${arg#--zone=}" ;;
                --format=*) format="\${arg#--format=}" ;;
              esac
            done

            if [[ -f "$state_file" ]]; then
              # shellcheck disable=SC1090
              source "$state_file"
            fi

            if [[ "\${INSTANCE_ZONE:-}" == "$zone" ]]; then
              if [[ "$format" == "get(networkInterfaces[0].accessConfigs[0].natIP)" ]]; then
                echo "\${INSTANCE_IP:-34.118.10.20}"
              else
                echo "scholarsync-searxng RUNNING \${INSTANCE_IP:-34.118.10.20}"
              fi
              exit 0
            fi

            exit 1
            ;;
          create)
            zone=""
            machine=""
            for arg in "$@"; do
              case "$arg" in
                --zone=*) zone="\${arg#--zone=}" ;;
                --machine-type=*) machine="\${arg#--machine-type=}" ;;
              esac
            done

            printf 'create zone=%s machine=%s\\n' "$zone" "$machine" >> "$log_file"

            if [[ "$zone" == "asia-south1-a" && "$machine" == "e2-small" ]]; then
              echo "ZONE_RESOURCE_POOL_EXHAUSTED" >&2
              exit 1
            fi

            cat > "$state_file" <<EOF
INSTANCE_ZONE=$zone
INSTANCE_MACHINE=$machine
INSTANCE_IP=34.118.10.20
EOF
            exit 0
            ;;
        esac
        ;;
      firewall-rules)
        if [[ "\${1:-}" == "create" ]]; then
          printf 'firewall\\n' >> "$log_file"
          exit 0
        fi
        ;;
      scp)
        zone=""
        for arg in "$@"; do
          case "$arg" in
            --zone=*) zone="\${arg#--zone=}" ;;
          esac
        done
        printf 'scp zone=%s\\n' "$zone" >> "$log_file"
        exit 0
        ;;
      ssh)
        zone=""
        remote_command=""
        for arg in "$@"; do
          case "$arg" in
            --zone=*) zone="\${arg#--zone=}" ;;
            --command=*) remote_command="\${arg#--command=}" ;;
          esac
        done
        printf 'ssh zone=%s command=%s\\n' "$zone" "$remote_command" >> "$log_file"
        exit 0
        ;;
    esac
    ;;
esac

echo "unexpected gcloud invocation: $command $*" >&2
exit 1
`,
    { mode: 0o755 }
  );
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("infra/searxng/deploy.sh", () => {
  it("falls back to the next zone when the primary zone is exhausted", async () => {
    const { stdout } = await execFileAsync("bash", [deployScriptPath], {
      cwd: path.dirname(deployScriptPath),
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH}`,
        FAKE_GCLOUD_LOG: logPath,
        FAKE_GCLOUD_STATE: statePath,
      },
    });

    const log = await readFile(logPath, "utf8");

    expect(log).toContain("create zone=asia-south1-a machine=e2-small");
    expect(log).toContain("create zone=asia-south1-b machine=e2-small");
    expect(log).toContain("scp zone=asia-south1-b");
    expect(log).toContain("ssh zone=asia-south1-b");
    expect(stdout).toContain("SearXNG URL: http://34.118.10.20:8080");
  });

  it("uses a strict remote startup command with a compose fallback", async () => {
    await execFileAsync("bash", [deployScriptPath], {
      cwd: path.dirname(deployScriptPath),
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH}`,
        FAKE_GCLOUD_LOG: logPath,
        FAKE_GCLOUD_STATE: statePath,
      },
    });

    const log = await readFile(logPath, "utf8");

    expect(log).toContain("set -euo pipefail");
    expect(log).toContain("docker run --rm");
    expect(log).toContain("curl -fsS");
  });
});
