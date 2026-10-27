import { Check } from 'lucide-react'
import { useState } from 'react'

import { Claude, Codex, Cursor, Pi } from '#/components/brands.tsx'
import { Button } from '#/components/ui/button.tsx'
import { PROMPT } from '#/prompt.ts'

/** Copies the prompt that sets up Fondu with a coding agent (the quick start's "Automatic installation") */
export function CopyPrompt() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Button variant="outline" size="lg" onClick={copy} title="Sets Fondu up with your coding agent">
      {copied ? (
        <Check className="text-brand-foreground" />
      ) : (
        <span className="flex items-center gap-1 [&_svg]:mx-0 [&_svg]:size-4 [&_svg]:opacity-100">
          <Claude className="text-[#D97757]" />
          <Codex />
          <Cursor />
          <Pi />
        </span>
      )}
      {copied ? 'Copied' : 'Copy prompt'}
    </Button>
  )
}
