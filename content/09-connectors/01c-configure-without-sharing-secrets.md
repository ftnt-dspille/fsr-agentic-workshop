---
title: Configure a Connector Without Sharing Its Secrets
linkTitle: Configure Safely
weight: 17
description: "Give the agent a reference to an API key instead of the key itself, so the secret never enters the chat."
---

Most connectors need a credential: an API key, a password, a token. The obvious way to configure one from a chat is to paste the key into the prompt. Don't. Anything you type to the agent goes to the model provider, lands in your session history and transcripts, and can be repeated back in a later answer. A key pasted once is a key you should treat as leaked.

`setup_connector` removes the need. You tell the agent *where* the key lives, never *what* it is. The toolkit reads the value inside its own process and sends it straight to FortiSOAR.

{{% notice warning %}}
If you ever paste a real key into a prompt, rotate it. Removing it from the chat does not remove it from logs.
{{% /notice %}}

## 1. Put the secret where the server can read it

Secrets are passed by reference. The simplest reference is an environment variable on the machine that runs the MCP server. Add it to the `env` block of the server entry you created in chapter 6, using the name `FSR_SECRET_<CONNECTOR>__<FIELD>`, for example `FSR_SECRET_VIRUSTOTAL__API_KEY` for the `virustotal` connector:

```json
"env": {
  "FSR_SECRET_VIRUSTOTAL__API_KEY": "<your VirusTotal API key>"
}
```

Restart the agent so the server picks it up.

Four rules are enforced by the tool, not by good manners:

- **Only `FSR_SECRET_*` names resolve.** The agent cannot ask for `AWS_SECRET_ACCESS_KEY` or any other variable of your machine to be copied into a connector.
- **A key works only for its own connector.** The variable name must carry the connector name followed by two underscores, so a key you set up for virustotal cannot be pointed at a different connector. Files follow the same rule: put them under a folder named for the connector, such as `virustotal/api_key`.
- **Files must live in one folder.** `{"file": "virustotal/api_key"}` reads a file inside the folder named by `FSR_SECRETS_DIR` and nothing outside it. Leave the variable unset and file references are simply off.
- **You can pin where keys may be sent.** Set `FSR_SECRET_ALLOWED_HOSTS` (comma-separated host names, subdomains included) in the same `env` block and every field that looks like a URL or host name must name one of those hosts, or the call is refused. Values the tool cannot read with certainty (for example a link with `user@` in it) are refused too. Leave it unset and the destination host is still reported in the result and shown in the approval prompt, so check it before you approve.
- **Installing needs a second yes.** If the connector is missing, `install: true` is refused until the call also carries `confirm_install: true`, because an install puts third-party code on the box. The agent should tell you what it will install first.

## 2. Ask the agent

Give your agent this prompt:

```text
Configure the virustotal connector with a configuration named "Lab". Use
setup_connector. The server URL is www.virustotal.com. The API key is in the
environment variable FSR_SECRET_VIRUSTOTAL__API_KEY: pass it as a reference, do not ask me for
the value. Check it first with check_only, then write it and run the healthcheck.
```

The call the agent makes looks like this. Notice there is no key in it:

```json
{
  "connector": "virustotal",
  "config_name": "Lab",
  "fields": {"server": "www.virustotal.com", "verify_ssl": true},
  "secrets": {"api_key": {"env": "FSR_SECRET_VIRUSTOTAL__API_KEY"}}
}
```

**You are done when:**

- The `check_only` call answers that it is ready to create the configuration and that one secret resolved, naming `env FSR_SECRET_VIRUSTOTAL__API_KEY` as its source and never its value.
- The write reports the configuration was created and the healthcheck says `Available`.
- Nothing in the reply, the findings or the transcript contains the key.

<!-- step: fsa09-08-configure-safely -->

<!-- capture: fsa09-08-configure-safely -->
![fsa09-08-configure-safely](fsa09-08-configure-safely.png?height=600px)

**Verify in the UI:** open the connector's **Configurations** and find "Lab". The API key field shows as a masked password.

## 3. Try to break it

These are worth running once so you trust the guard:

| You ask the agent to | What happens |
|---|---|
| Put the key in `fields` as a plain value | Refused. The reply says it is a secret field and how to pass a reference. The value you typed is not repeated. |
| Use `{"env": "HOME"}` or any name without the `FSR_SECRET_` prefix | Refused, with the prefix rule. |
| Use another connector's key, such as `FSR_SECRET_JIRA__TOKEN` for virustotal | Refused: the key is not bound to that connector. |
| Point the connector at a host you did not list in `FSR_SECRET_ALLOWED_HOSTS` | Refused before any secret is read. |
| Use a variable that is not set | Blocked, telling you to add it to the server's `env` block and restart. |
| Use `{"file": "../../etc/passwd"}` | Refused. A file reference cannot leave `FSR_SECRETS_DIR`. |
| Configure with a wrong key | The configuration is saved, the healthcheck reports `Disconnected` with the service's message, and the status is `partial`. The wrong key is not shown. |
| Reuse a configuration name that exists | It is overwritten, and the result says so in plain words. |

## 4. Standing rules for your agent

1. **Never ask a user for a key.** Ask which environment variable holds it.
2. **Run `check_only` first.** It resolves the references and validates the field names without writing anything.
3. **Do not use `create_connector_configuration`, `update_connector_configuration` or `upsert_connector_configuration` for credentials.** Their descriptions say so, but they accept raw values; `setup_connector` is the safe path.
4. **Treat `partial` as not done.** A saved configuration that fails its healthcheck is not working.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "is not set in the environment of the server process" | The variable is not in the MCP server's `env` block, or the agent was not restarted | Add it, restart the agent |
| "must name a variable starting with FSR_SECRET_" | The variable has another name | Rename it, or set a second one with the prefix |
| "is not bound to 'virustotal'" | The variable or file is named for a different connector | Rename it `FSR_SECRET_VIRUSTOTAL__<FIELD>`, or move the file under `virustotal/` |
| "needs confirm_install=true" | The connector is not installed and the call did not confirm the install | Agree to the install, then have the agent repeat the call with `confirm_install: true` |
| "file references are off" | `FSR_SECRETS_DIR` is not set | Set it, or use an environment variable |
| "could not read the configuration schema" | The appliance was busy, or that connector version is not installed | Retry in a moment; add `install: true` if it is missing |
| "has no field 'X' - did you mean 'Y'?" | A field name typo | Use the suggested name |
| Healthcheck `Disconnected` | Wrong URL, wrong key, or no network path to the service | Fix the value at its source, then re-run; the key never has to be retyped into the chat |
