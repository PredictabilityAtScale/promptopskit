export interface Sections {
  system_instructions?: string;
  prompt_template?: string;
  notes?: string;
}

const SECTION_MAP: Record<string, keyof Sections> = {
  'system instructions': 'system_instructions',
  'prompt template': 'prompt_template',
  'notes': 'notes',
};

/**
 * Extract named sections from the markdown body using H1 headings.
 * Case-insensitive. H2+ within a section is treated as content.
 * If no H1 headings are found, the entire body is treated as prompt_template.
 */
export function extractSections(body: string): Sections {
  const lines = body.split('\n');
  const sections: Sections = {};

  let currentKey: keyof Sections | null = null;
  let currentLines: string[] = [];
  let foundAnyH1 = false;

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      // Flush previous section
      if (currentKey) {
        sections[currentKey] = currentLines.join('\n').trim();
      }

      foundAnyH1 = true;
      const heading = h1Match[1].trim().toLowerCase();
      currentKey = SECTION_MAP[heading] ?? null;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush last section
  if (currentKey) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  // If no H1 headings found, treat entire body as prompt_template
  if (!foundAnyH1) {
    const trimmed = body.trim();
    if (trimmed) {
      sections.prompt_template = trimmed;
    }
  }

  return sections;
}
