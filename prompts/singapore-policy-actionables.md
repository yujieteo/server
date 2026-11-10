# Change the sources or rules of Singapore policy actionables

The sources, the points and the word lists are at the top of `sbin/sg-update`. A change here needs a server install. Paste one of these into a Claude session in this repo.

Add a source:

```text
In sbin/sg-update, add SOURCE as a source. Use primary documents only, no news.
Find its feed first. Most agency sites built on Isomer serve one at their news section's path plus /rss.xml.
If it has no feed, write a small parser like parse_bills or parse_mom.
Test the fetch and the parse locally with a curl stand-in for ftp.
Update the source table in the post in the site repo too.
Then commit and open a PR. Do not run ./apply --install.
```

Change the rules:

```text
In sbin/sg-update, change RULE. Run the job with --render on saved copies before and after, and show me how the top 40 changes.
Update the points table in the post in the site repo too.
Then commit and open a PR. Do not run ./apply --install.
```

Not yet in the list: MAS, HDB, IRAS, CPF and Singapore Statutes Online.

To add the weekly notes, use the prompt in the [site repo](https://github.com/yujieteo/site/blob/main/prompts/singapore-policy-actionables.md).
