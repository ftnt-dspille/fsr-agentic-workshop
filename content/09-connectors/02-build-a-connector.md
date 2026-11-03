---
title: Build Your Own Connector
linkTitle: Build One
weight: 20
description: "Hand the agent a goal and it builds a working FortiSOAR connector: scaffold, implement, package, deploy, run."
---

You do not write the connector. You describe what it should do, and the agent builds it. The agent scaffolds the project with the `pyfsr connector` CLI, writes the operation code, packages it, installs it on the box, and runs the new operation to prove it works.

The example is a connector that fetches a random dad joke. The same prompt pattern works for any API you can describe.

{{% notice note %}}
This lab writes code on your machine and installs it on the box. Run it in the lab working folder from chapter 6. Connector development at production depth (ingestion, output schemas, Content Hub publishing) is covered in the separate FortiSOAR Connectors workshop.
{{% /notice %}}

## 1. Scaffold and implement

Give your agent this prompt:

```text
Build me a FortiSOAR connector that fetches a random dad joke from the public
icanhazdadjoke.com API. Scaffold it as agentlab-dadjoke with the pyfsr connector
CLI, then implement a get_joke operation that GETs https://icanhazdadjoke.com
with an Accept: application/json header and returns the joke text. Keep the
scaffold's server configuration field and use it as the base URL. Keep
info.json's operation list in sync with operations.py. Show me the diff of what
you changed.
```

<!-- step: fsa09-03-scaffold-connector -->

<!-- capture: fsa09-03-scaffold-connector -->
![fsa09-03-scaffold-connector](fsa09-03-scaffold-connector.png?height=600px)

The scaffold is a working starting point with one server configuration field, one operation and a health check. The agent edits it instead of writing everything from scratch.

Review the diff. The operation name in `info.json` must match the one in `operations.py`.

## 2. Package and deploy

Give your agent this prompt:

```text
Package the connector (pyfsr connector package agentlab-dadjoke) and then
install the resulting .tgz on the box. If the install fails because the
connector is already active, do not stop there: install it again with the
same .tgz and replace enabled (this replaces only agentlab-dadjoke). Then
configure it with server https://icanhazdadjoke.com and confirm it is
healthy.
```

<!-- step: fsa09-04-deploy-connector -->

<!-- capture: fsa09-04-deploy-connector -->
![fsa09-04-deploy-connector](fsa09-04-deploy-connector.png?height=600px)

Installing a connector is confirm-gated, because it puts executable code on the appliance. The agent tells you what it will install and waits for your go-ahead. The health check after the install shows whether the connector works.

## 3. Run it

Give your agent this prompt:

```text
Run the get_joke operation of agentlab-dadjoke and show me the joke it
returned.
```

<!-- step: fsa09-05-run-own-connector -->

<!-- capture: fsa09-05-run-own-connector-joke -->
![fsa09-05-run-own-connector-joke](fsa09-05-run-own-connector-joke.png?height=600px)

**You are done when:** a joke comes back. The joke comes from code the agent wrote, which called a live external API from FortiSOAR's connector runtime.

**Verify in the UI:** open **Connectors**. AgentLab Dad Joke v1.0.0 is listed as installed.

<!-- capture: fsa09-05-run-own-connector -->
![fsa09-05-run-own-connector](fsa09-05-run-own-connector.png?height=600px)

## What the agent did

These are the calls from a recorded run of the prompts above. Your agent's calls will differ, but the shape should match.

**Check the scaffold.** It checked the `pyfsr connector` help, listed the scaffold and read its files.

```text
> Bash {"command": "pwd; ls -la; pyfsr connector --help 2>&1 | head -30"}
> Bash {"command": "cd agentlab-dadjoke && find . -type f | head -50; git status --short . | head; pyfsr connector scaffold --help"}
> Bash {"command": "cat operations.py connector.py info.json requirements.txt; git log --oneline -3 -- . ; git ls-files . | head"}
```


**Package, install and configure.** It packaged the connector, installed the `.tgz` with `confirm` set to true, saved a `default` configuration with the server URL, and ran the health check. The health check reported `Available`.

```text
> Bash {"command": "pyfsr connector package agentlab-dadjoke 2>&1 | tail -20; ls"}
> install_connector {"path": "agentlab-dadjoke/dist/agentlab-dadjoke-1.0.0.tgz", "confirm": true}
> upsert_connector_configuration {"connector": "agentlab-dadjoke", "name": "default", "config": {"server": "https://icanhazdadjoke.com"}, "default": true}
> healthcheck_connector {"connector": "agentlab-dadjoke", "config": "<config id>"}
```


**Run it.** It called `get_joke`, and the operation returned a joke with status `Success`.

```text
> run_connector_operation {"connector": "agentlab-dadjoke", "operation": "get_joke"}
```


## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pyfsr: command not found` | The CLI is in a virtual environment the agent's shell does not see | `pip install "fsr-agentic-toolkit==0.2.3"` into the active environment |
| Package fails: missing required file | A core file was renamed or deleted | `info.json`, `connector.py`, `operations.py` and `requirements.txt` must all exist |
| Install succeeds, operation unknown | `info.json` and `operations.py` disagree | The operation name must match in both. Repackage and install again |
| `get_joke` or the health check still runs the old code after a reinstall | The appliance's connector workers still serve the previous version | Wait a few minutes and run it again. The workers pick up the new code on their own |
| Healthcheck or `get_joke` times out | The box cannot reach icanhazdadjoke.com | The connector runs on the appliance, which needs outbound HTTPS to the API. On an air-gapped box, point the connector at a service the box can reach |
