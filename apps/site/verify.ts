// What the site's build must have written (`bun run build` ends with it; `bun run verify` runs it again): the
// descriptions' length (app/docs.ts).
import { descriptionProblems } from './app/docs.ts'

const problems: string[] = descriptionProblems()

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('site: ok')
