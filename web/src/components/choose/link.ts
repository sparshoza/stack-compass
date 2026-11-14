import { defaultAnswers, type Answers } from '@/engine/answers'
import { decode, decodePiece, type Piece } from '@/engine/share'
import { kb } from '@/lib/kb'
import type { ChooseMode } from './ChooseSheet'

export interface OpeningLink {
  mode: ChooseMode
  answers: Answers
  piece: Piece
  /** Notes about parts of the link that could not be used, per mode. */
  notice: string | null
  pieceNotice: string | null
  /** True when the link carries something to show, so the sheet opens on it. */
  open: boolean
}

const TOO_LONG = 'This link is too long to read, so its answers were not used.'

function noticeOf(ignored: string[], tooLong: boolean | undefined, retry: string): string | null {
  if (tooLong) return `${TOO_LONG} ${retry}`
  return ignored.length ? `Some parts of this link were ignored: ${ignored.join(', ')}.` : null
}

/**
 * Reads the link the page was opened with. A Whole stack link (`t=...`,
 * phase one and two links included) opens on its live stack; a One piece
 * link (`m=piece&l=...`) opens on its part and matches.
 */
export function readOpeningLink(search: string): OpeningLink {
  const query = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(query)
  const base: OpeningLink = {
    mode: 'stack',
    answers: defaultAnswers(),
    piece: { layer: null, selection: {} },
    notice: null,
    pieceNotice: null,
    open: false,
  }
  if (params.get('m') === 'piece') {
    const { piece, ignored, tooLong } = decodePiece(query, kb)
    return {
      ...base,
      mode: 'piece',
      piece,
      pieceNotice: noticeOf(ignored, tooLong, 'Pick a part to see the tools that fit.'),
      open: params.has('l'),
    }
  }
  if (!params.has('t')) return base
  const { answers, ignored, tooLong } = decode(query, kb)
  return { ...base, answers, notice: noticeOf(ignored, tooLong, 'Answer the questions to build a stack.'), open: true }
}
