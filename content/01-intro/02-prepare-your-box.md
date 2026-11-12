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
   pip install "fsr-agentic-toolkit==0.2.3"
   ```

2. Tell the script where your box is. Use your own URL and login. Set `FSR_VERIFY_SSL=0` only if your box uses a self-signed certificate.

   ```bash
   export FSR_BASE_URL=https://fortisoar.example.com
   export FSR_USERNAME=<your-admin-login>
   export FSR_PASSWORD='<your-password>'
   export FSR_VERIFY_SSL=0
   ```

3. Prepare the box:

   ```bash
   python3 tools/lab_setup.py prepare
   ```

   It is safe to run again: it skips anything that already exists. It ends with a check.

**You are done when** the check prints **demo alerts: 6/6 present**, **custom code execution: on** and **code-snippet configuration: present**.

To start over later, `python3 tools/reset_lab.py` removes everything the labs create (it asks you to type `RESET`), then run `prepare` again.
