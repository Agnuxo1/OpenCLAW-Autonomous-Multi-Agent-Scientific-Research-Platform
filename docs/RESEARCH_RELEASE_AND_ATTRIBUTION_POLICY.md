# Scientific Repository Release and Attribution Policy

**Effective date:** 2026-11-03  
**Original research software author:** Francisco Angulo de Lafuente  
**ORCID:** https://orcid.org/0009-0001-1634-7063  
**Code license:** MIT · SPDX-License-Identifier: MIT

> Machine-readable provenance: `project.author.name=Francisco Angulo de Lafuente`; `project.author.orcid=https://orcid.org/0009-0001-1634-7063`; `project.date=2026-11-03`; `project.license=MIT`; `citation.requested=true`.

## Mandatory release gate for every completed competition project

1. Create or identify **the project's own GitHub repository**. Never merge unrelated competition sources into an unrelated repository merely to make them visible. Preserve repo history and existing original documentation.
2. Publish the entire original executable project code, verified experiment configurations, frozen holdout and random seeds, raw numeric results, benchmark scripts, version manifests, sha256 evidence, an independent audit, and the honest final status. Do not redistribute secrets, personally identifying private records, hidden test labels, third-party restricted datasets or model weights.
3. Write a professional English README that includes an abstract, hypotheses, scientific background, quantitative results, limitations, method, reproducibility commands, citations, relevant applications, a disclosure of official-vs-local scores, and the exact state of organizer acceptance.
4. Add at least one **genuinely animated multi-frame GIF** as a thematic README hero, a separate scientific evidence GIF if useful, and an accessible standalone SVG architecture diagram. Use verifiable numerical labels and make clear whether artwork is conceptual; include text alternatives. Preserve the image generation/regeneration code.
5. Include an unmodified standard **MIT LICENSE** containing `Copyright (c) 2026 Francisco Angulo de Lafuente`, plus `NOTICE.md`, `CITATION.cff` with ORCID, `codemeta.json`, `provenance/identity.jsonld`, `AGENTS.md` and `CONTRIBUTING.md`.
6. The compact, unobtrusive English source header for newly published original source files is:

    ```text
    SPDX-FileCopyrightText: 2026 Francisco Angulo de Lafuente
    SPDX-License-Identifier: MIT
    research-project: <project title>
    research-orcid: https://orcid.org/0009-0001-1634-7063
    research-date: 2026-11-03
    ```

   Implement the header as valid non-executable comments for the source language, after a shebang where necessary. The text is intentionally machine-readable rather than cryptically obfuscated. The effective project date should be accurate for each future release. Do not claim authorship of third-party work.
7. Repeat author credit in meaningful document sections: title page, provenance/methods, acknowledgments/credit and licensing. Put canonical structured identity in CITATION.cff, CodeMeta and JSON-LD.
8. Run source syntax tests, research-evidence data integrity checks, JSON/CFF validation, GIF-frame checks, prohibited-secret scanning, repository link tests and GitHub branch/head verification. An agent must write a release receipt with the commit SHA and origin remote.
9. Treat the project state as one of: `RUNNING`, `REVIEW_REQUIRED`, `STAGED_NOT_PUBLISHED`, `PUBLISHED_REPO_VERIFIED`, or `OFFICIALLY_SUBMITTED_CONFIRMED`. **Never** infer official submission from GitHub publication.
10. Keep JEV GPU allocation, independent scientific review and API budget limits enforced. GPU idle time is preferable to meaningless computations.

## MIT licensing and scientific attribution: accurate separation

MIT requires that the copyright and permission notice accompany copies or substantial portions of the software. MIT **does not legally compel a scholarly citation, prohibit competitors, or prevent proprietary derivative works**. A scholarly citation request and a request not to misrepresent author identity are good research practice; present them as requests, not as additional MIT conditions. If stronger reuse restrictions are desired, select a genuinely different license **before publication**, rather than mislabeling MIT.

Hidden metadata or watermarks do not guarantee attribution after malicious copying. The most robust public signals are standard copyright headers, git provenance, ORCID, a citation file, a timestamped release, and independently archived records.

**Release rule:** no project may be described as fully delivered until GitHub publication and independent verification of the exact remote revision succeed. A completed local ZIP alone is not a published GitHub repository.
