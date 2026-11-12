---
title: Configure a Connector Without Sharing Its Secrets
linkTitle: Configure Safely
weight: 17
description: "Give the agent a reference to an API key instead of the key itself, so the secret never enters the chat."
---

Most connectors need a credential, such as an API key. Do not paste the key into the chat. Anything you type to the agent goes to the model provider and stays in your session history. Instead, give the agent the name of an environment variable that holds the key. The tool reads the value itself and sends it straight to FortiSOAR.

{{% notice warning %}}
If you paste a real key into a prompt by mistake, rotate it. Deleting the message does not remove the key from logs.
{{% /notice %}}

## 1. Put the secret where the server can read it

Add the key to the `env` block of the MCP server entry you made in chapter 6. The name has this form: `FSR_SECRET_`, then the connector name, two underscores, and the field name. For VirusTotal the name is `FSR_SECRET_VIRUSTOTAL__API_KEY`:

```json
"env": {
  "FSR_SECRET_VIRUSTOTAL__API_KEY": "<your VirusTotal API key>"
}
```

Restart the agent so the server picks it up.

The tool enforces these rules:

- **Only `FSR_SECRET_*` names resolve.** The agent cannot copy any other variable from your machine.
- **A key works only for its own connector.** `FSR_SECRET_VIRUSTOTAL__API_KEY` cannot be used for another connector.
- **You can limit where keys go.** Optionally, add `FSR_SECRET_ALLOWED_HOSTS` (comma-separated host names) to the same `env` block. A field that names a host must then use one of those hosts, or the call is refused. Without it, the tool shows the destination host in your coding agent's approval prompt. Check that host before you approve.
- **Installing needs a second yes.** If the connector is missing, `install: true` is refused until the call also carries `confirm_install: true`. An install puts third-party code on the box, so your coding agent's approval prompt asks you before it runs. Check the connector name in the prompt first.

## 2. Ask the agent

Give your agent this prompt:

```text
Configure the virustotal connector with a configuration named "Lab". The
server URL is www.virustotal.com. The API key is in the environment variable
FSR_SECRET_VIRUSTOTAL__API_KEY: pass it as a reference, do not ask me for the
value. Make sure it is checked before it is written, and run the healthcheck
after you save it.
```

The call the agent makes looks like this. There is no key in it:

```json
{
  "connector": "virustotal",
  "config_name": "Lab",
  "fields": {"server": "www.virustotal.com", "verify_ssl": true},
  "secrets": {"api_key": {"env": "FSR_SECRET_VIRUSTOTAL__API_KEY"}}
}
```

**You are done when:**

- The `check_only` call says the configuration is ready to create, and one secret resolved. It names the environment variable as the source, never the value.
- The write reports that the configuration was created, and the healthcheck says **Available**.
- Nothing in the reply, the findings or the transcript contains the key.

<!-- step: fsa09-08-configure-safely -->

<!-- capture: fsa09-08-configure-safely -->
![fsa09-08-configure-safely](fsa09-08-configure-safely.png?height=600px)

**Verify in the UI:** open the connector's **Configurations** and find "Lab". The API key shows as a write-only **Set API Key** link. The value is never displayed, not even masked.

<!-- capture: fsa09-08-configure-safely-masked-key -->
![fsa09-08-configure-safely-masked-key](fsa09-08-configure-safely-masked-key.png?height=600px)

## 3. Optional: try to break it

Run these once to see the guards work:

| You ask the agent to | What happens |
|---|---|
| Put the key in `fields` as a plain value | Refused. The reply says it is a secret field and shows how to pass a reference. The value is not repeated. |
| Use `{"env": "HOME"}`, or any name without the `FSR_SECRET_` prefix | Refused, with the prefix rule. |
| Use another connector's key, such as `FSR_SECRET_JIRA__TOKEN` for virustotal | Refused. The key is not bound to that connector. |
| Configure with a wrong key | The configuration is saved, the healthcheck reports **Disconnected** with the service's message, and the status is **partial**. The wrong key is not shown. |

## 4. Standing rules for your agent

1. Never ask a user for a key. Ask which environment variable holds it.
2. Run `check_only` first. It checks the references without writing anything.
3. Do not use `create_connector_configuration`, `update_connector_configuration` or `upsert_connector_configuration` for credentials. They accept raw values. Use `setup_connector`.
4. Treat **partial** as not done. A saved configuration that fails its healthcheck is not working.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "is not set in the environment of the server process" | The variable is not in the MCP server's `env` block, or the agent was not restarted | Add it to the `env` block, then restart the agent |
| "must name a variable starting with FSR_SECRET_" | The variable has another name | Rename it to start with `FSR_SECRET_` |
| "is not bound to 'virustotal'" | The variable is named for a different connector | Rename it to `FSR_SECRET_VIRUSTOTAL__<FIELD>` |
| "needs confirm_install=true" | The connector is not installed, and the call did not confirm the install | Agree to the install, then have the agent repeat the call with `confirm_install: true` |
| "could not read the configuration schema" | The appliance was busy, or that connector version is not installed | Retry in a moment. Add `install: true` if the connector is missing |
| Healthcheck **Disconnected** | Wrong URL, wrong key, or no network path to the service | Fix the value at its source, then run the healthcheck again. The key never has to be retyped into the chat |
