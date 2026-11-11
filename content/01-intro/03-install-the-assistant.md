---
title: Install the Agentic Assistant
linkTitle: Install the Agentic Assistant
weight: 30
description: "Put the Agentic Assistant solution pack on your FortiSOAR box: the connector, the two widgets and the Monitor dashboard, in one import."
---

The Agentic Assistant is not part of FortiSOAR. It ships as a solution pack: one zip that carries the connector, both widgets and the Monitor dashboard. This page installs it. If your lab box already has the assistant, run the check in step 1 and skip to the configuration check in step 5.

| What the pack carries | Version |
|---|---|
| Solution pack `agenticAssistant` | 1.1.0 |
| Connector `connector-fsr-agentic-assistant` | 0.6.1 |
| Widget `agenticAssistant` | 1.4.1 |
| Widget `agenticAssistantMonitor` | 1.1.0 |
| Dashboard: Agentic Assistant Monitor | |
| Framework `fsr-playbooks` (installed by the connector) | 0.11.0 |

You need: FortiSOAR 8.0 or newer, an LLM the appliance can reach (an OpenAI or Anthropic API key, an OpenAI-compatible endpoint, or the FortiAI service this lab uses), shell access to the appliance as `csadmin` for step 2, and reachability of `pypi.org` over HTTPS.

## 1. Check whether it is already installed

Sign in to FortiSOAR and open **Content Hub** > **Manage**, filtered to **Widgets**. If you see **Agentic Assistant** and **Agentic Assistant Monitor** in the list, and a connector named **FSR Agentic Assistant** on the **Connectors** page, the pack is on the box: skip to step 6.

<!-- step: fsa01-05-assistant-present -->
<!-- capture: fsa01-05-assistant-present -->
![fsa01-05-assistant-present](fsa01-05-assistant-present.png?height=600px)

## 2. Let the connector reach PyPI

The connector's installer pulls its playbook framework (`fsr-playbooks`) from PyPI at import time. The appliance's integration environment blocks that index by default, so allow it first. On the appliance, as `csadmin`:

```bash
sudo chattr -i /opt/cyops/configs/integrations/packages/integrations_env/pip.conf
sudo sed -i -e '$a extra-index-url = https://pypi.org/simple/' -e '$a trusted-host = pypi.org' /opt/cyops/configs/integrations/packages/integrations_env/pip.conf
sudo chattr +i /opt/cyops/configs/integrations/packages/integrations_env/pip.conf
```

The `csadmin` sudo rules allow exactly this: `chattr` and `sed`, not a root shell.

## 3. Allow custom content

The pack's connector and widgets are custom content, which a locked-down box refuses to import. Under **System Settings** > **Advanced** > **Development Features**, enable **custom connectors** and **custom widgets**.

<!-- step: fsa01-15-dev-features -->
<!-- capture: fsa01-15-dev-features -->
![fsa01-15-dev-features](fsa01-15-dev-features.png?height=600px)

## 4. Download and import the pack

Download the pack zip:

{{< download "/downloads/agentic-assistant-pack-1.1.0.zip" >}}agentic-assistant-pack-1.1.0.zip (about 4 MB){{< /download >}}

Then install it with the **Import Wizard** (**Application Editor** > **Import Wizard**), not Content Hub. A Content Hub upload registers the pack and its dashboard but silently skips the bundled connector and widget files, so you end up with a pack entry and nothing installed. The Import Wizard installs all of it.

<!-- step: fsa01-20-import-upload manual: performed on a clean box; the authoring box already runs this pack -->

Upload the zip, review the summary, and start the import. The connector's dependencies install during the import; this is the longest step. If the connector's status stays **In-Progress** for a long time, see the troubleshooting note at the end of this page.

<!-- step: fsa01-22-import-installed manual: performed on a clean box -->

## 5. Publish the widgets

Widgets import as **drafts**. In **Content Hub** > **Manage** (filtered to **Widgets**), open **Agentic Assistant** and publish it, then do the same for **Agentic Assistant Monitor**. A draft widget is invisible to record pages and dashboards, so nothing below works until both are published.

<!-- step: fsa01-25-widgets-published -->
<!-- capture: fsa01-25-widgets-published -->
![fsa01-25-widgets-published](fsa01-25-widgets-published.png?height=600px)

## 6. Configure the connector

Open the **FSR Agentic Assistant** connector and create a **new** configuration. Do not edit an existing one: updating a configuration does not replace a stored secret. Pick the LLM provider your box can reach, paste its API key (or point an OpenAI-compatible endpoint at your service), mark the configuration as the **default**, and save.

The lab box uses FortiAI as the provider, so the assistant spends FortiAI tokens, the same currency as the rest of this workshop.

<!-- step: fsa01-30-connector-config -->
<!-- capture: fsa01-30-connector-config -->
![fsa01-30-connector-config](fsa01-30-connector-config.png?height=600px)

Run the connector's **health check** and wait for green.

<!-- step: fsa01-35-connector-health -->
<!-- capture: fsa01-35-connector-health -->
![fsa01-35-connector-health](fsa01-35-connector-health.png?height=600px)

## Verify

Open any alert: the **Agentic Assistant** launcher appears on the record page, and the panel opens with its quick actions.

<!-- step: fsa01-40-record-launcher -->
<!-- capture: fsa01-40-record-launcher -->
![fsa01-40-record-launcher](fsa01-40-record-launcher.png?height=600px)

Open the **Agentic Assistant Monitor** dashboard: usage, sessions and the autonomy policy render.

<!-- step: fsa01-45-monitor-dashboard -->
<!-- capture: fsa01-45-monitor-dashboard -->
![fsa01-45-monitor-dashboard](fsa01-45-monitor-dashboard.png?height=600px)

## Troubleshooting

- **Content Hub showed the pack but nothing works.** That install path skips bundled connector and widget files. Re-import the same zip through the Import Wizard.
- **The connector's status stays In-Progress.** A requirements install that failed once is never retried automatically. Re-run it from the connector's action menu (**Dependencies check**), after fixing the cause: most often the PyPI lines from step 2 are missing, or the appliance cannot resolve `pypi.org`.
- **The import refuses custom content.** Step 3's Development Features toggles are off, or your login lacks the permission to change them.
- **The widgets are listed but record pages show no launcher.** The widgets are still drafts: publish them (step 5).
- **Health check fails on the model.** The appliance cannot reach the LLM endpoint, or the key is wrong. Health check names the cause; fix the provider or key in a NEW configuration.
