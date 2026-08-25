# online-sunshine-beautify-
Set for Cloudflare deployment. Paste online sunshine url and have content rendered cleanly

## Testing
Install wrangler with npm to mock the Cloudflare env
`npm install -g wrangler`

run wrangler locally
` npx wrangler pages dev public --port 8788`

## Test Cases
Orginal test case for project
`https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0812/Sections/0812.014.html`

Found Issue [#2](https://github.com/prwilkin/online-sunshine-beautify/issues/2) in this
`https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&Search_String=&URL=0700-0799/0782/Sections/0782.04.html`


Found Issue [#5](https://github.com/prwilkin/online-sunshine-beautify/issues/5) in this
`https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0810/Sections/0810.145.html`

Found issue [[#8](https://github.com/prwilkin/online-sunshine-beautify/issues/8)] in this
`https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0794/Sections/0794.011.html`