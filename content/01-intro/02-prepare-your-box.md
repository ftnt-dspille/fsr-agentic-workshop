---
title: Prepare Your Box
linkTitle: Prepare Your Box
weight: 20
description: "One command puts the lab alerts and settings on your FortiSOAR box before you start."
---

The labs work on alerts and settings that you do not build yourself: the **Agent Lab** demo alerts, three chapter 3 alerts, and a configured code-snippet connector. Put them on your box once, before chapter 2. You need Python 3.10 or later and an administrator login to your box.

1. Get the workshop files and install the toolkit (it brings the pyfsr library the script uses):

   ```bash
   git clone https://github.com/ftnt-dspille/fsr-agentic-workshop.git
   cd fsr-agentic-workshop
   python3 -m venv .venv && source .venv/bin/activate
   pip install "fsr-agentic-toolkit==0.2.3" "pyfsr>=0.35.0"
   ```

2. Register your box with pyfsr. It asks for the URL and how you sign in, checks that the login works, and only then saves it under the name `lab`:

   ```bash
   pyfsr instances add lab
   ```

   {{% tabs groupid="box" %}}
   {{% tab title="FortiSOAR" %}}
   Answer the questions with your box URL and an administrator login: answer **n** to the API-key question, then give your login id and password. Answer **n** to the certificate question only if your box uses a self-signed certificate.
   {{% /tab %}}
   {{% tab title="FortiSOC" %}}
   FortiSOC signs in with an API key. Create one first:

   1. In FortiSOC, click the **Settings** (gear) icon. Under **Security Management**, open **Access Keys**, then the **API Key** tab, and click **Add**.

      ![FortiSOC Access Keys page, API Key tab, Add button](fsoc-api-key-list.png?width=518px)

   2. Give the key a **Name** and a **Valid Till** in days. Under **Teams**, check **SOC Team**. Under **Roles**, check **Full Admin**, because the lab setup changes box settings. Click **Save**.

      ![New API Key form with SOC Team and Full Admin checked](fsoc-api-key-form.png?width=700px)

   3. Click **Copy API Key** in the popup. FortiSOC never shows the key again.

      ![API Key popup with the Copy API Key button](fsoc-api-key-popup.png?width=612px)

   Then run `pyfsr instances add lab`, give your FortiSOC URL, answer **y** to the API-key question, and paste the key.
   {{% /tab %}}
   {{% /tabs %}}

   The password or key is typed without echo and is not stored in your shell history. pyfsr keeps it in `~/.pyfsr/lab.env`, readable only by you, and every later chapter uses the name `lab`. If the login fails, nothing is saved: run the command again.

3. Prepare the box:

   ```bash
   python3 tools/lab_setup.py --instance lab prepare
   ```

   It is safe to run again: it skips anything that already exists. It ends with a check.

**You are done when** the check prints **demo alerts: 6/6 present**, **custom code execution: on** and **code-snippet configuration: present**.

To start over later, `python3 tools/reset_lab.py --instance lab` removes everything the labs create (it asks you to type `RESET`), then run `prepare` again.
