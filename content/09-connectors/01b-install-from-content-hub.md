---
title: Install from the Content Hub
linkTitle: Install from Hub
weight: 15
description: "Have the agent pull a connector it does not yet have from the Content Hub, configure it, and prove it is healthy."
---

The last page ran a connector the box already had. Often the connector you need is in the **Content Hub** but not installed yet. In this page the agent installs it, configures it and runs a health check.

This page uses `whois-rdap`. It looks up domain and IP registration, and it needs no credentials. You can use any Content Hub connector the same way. Change the name in the prompts.

{{% notice note %}}
Installing a connector puts executable code on the appliance. Your coding agent's approval prompt asks you before the install runs, and again before the configuration is saved. Read each prompt, then approve. Run this page in the lab working folder from chapter 6, and turn off the read-only guard first (chapter 7 shows how).
{{% /notice %}}

## 1. Install

Give your agent this prompt:

```text
Install the whois-rdap connector from the Content Hub on this box. Tell me
what you are about to install and its version before you do it, then install
it and report whether it landed.
```

<!-- step: fsa09-06-install-from-hub -->

<!-- capture: fsa09-06-install-from-hub -->
![fsa09-06-install-from-hub](fsa09-06-install-from-hub.png?height=600px)

The agent passes the connector's name, not a file path. The toolkit finds the name in the Content Hub and installs the latest version.

## 2. Configure and health-check

Give your agent this prompt:

```text
Show me the configuration this connector expects, set up a configuration named
default with sensible values for the lab, and then health-check it. If the
health check needs credentials I have not given you, stop and tell me exactly
which fields it wants rather than guessing.
```

<!-- step: fsa09-07-configure-and-health -->

<!-- capture: fsa09-07-configure-and-health -->
![fsa09-07-configure-and-health](fsa09-07-configure-and-health.png?height=600px)

The agent reads the expected configuration, saves a `default` configuration, and runs the health check. A connector that needs credentials reports unhealthy until you give it valid ones. That is the correct result, not an agent failure.

**You are done when:** the agent names the connector and version it installed, shows the configuration fields, and reports the health result. The result is `Available`, or a list of the credentials it still needs.

**Verify in the UI:** open **Connectors**. The connector shows as installed, with its `default` configuration and health state.

## What the agent did

This is the call sequence from a recorded run of the prompts above. Your agent's calls will differ, but the shape should match.

**Install.** It called `install_connector` by name, listed the connectors, then repeated the install with `confirm` set to true and listed them again.

```text
> install_connector {"name": "whois-rdap"}
> list_connectors {}
> install_connector {"name": "whois-rdap", "confirm": true}
> list_connectors {}
```


**Configure and health-check.** It read the expected configuration, which is empty because the connector takes no credentials. It saved an empty `default` configuration and ran the health check, which reported the connector as available.

```text
> default_connector_config {"connector": "whois-rdap"}
> upsert_connector_configuration {"connector": "whois-rdap", "name": "default", "config": {}, "default": true}
> healthcheck_connector {"connector": "whois-rdap"}
```


## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Install fails: connector not found | The name does not match a Content Hub entry | Ask the agent to list the Content Hub, or check the exact name in the UI |
| Install fails: already installed | The connector is already on the box | Skip to the configure step |
| Health check is unhealthy | The connector needs valid credentials or a reachable service | Give it valid configuration. A connector to an external API cannot be healthy without one |
| 403 on install | The login's role cannot manage connectors | Add the Application Administrator role to the login the agent uses (chapter 6) |
