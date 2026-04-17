import {
  Chapter,
  ChapterDetails,
  ContentRating,
  HomeSection,
  HomeSectionType,
  Manga,
  MangaStatus,
  MangaTile,
  PagedResults,
  Request,
  RequestManager,
  Response,
  SearchRequest,
  Source,
  SourceInfo,
  Tag,
  TagSection,
} from 'paperback-extensions-common'

const BASE_URL = 'https://manga-tr.com'

export const MangaTRInfo: SourceInfo = {
  name: 'Manga-TR',
  description: "Türkiye'nin en büyük çevrimiçi manga okuma sitesi",
  author: 'DanteZoldyck',
  authorWebsite: 'https://github.com/DanteZoldyck',
  version: '1.0.0',
  icon: 'icon.png',
  contentRating: ContentRating.EVERYONE,
  websiteBaseURL: BASE_URL,
  language: 'tr',
}

export class MangaTR extends Source {
  readonly requestManager: RequestManager = createRequestManager({
    requestsPerSecond: 3,
    requestTimeout: 20000,
    interceptor: {
      interceptRequest: async (request: Request) => {
        request.headers = {
          ...request.headers,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          Referer: BASE_URL,
        }
        return request
      },
      interceptResponse: async (response: Response) => response,
    },
  })

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const url = `${BASE_URL}/${mangaId}.html`
    const request = createRequestObject({ url, method: 'GET' })
    const response = await this.requestManager.schedule(request, 1)
    const $ = this.cheerio.load(response.data)
    const title = $('h2.widget-title, h1').first().text().trim() || 'Bilinmiyor'
    const image = $('img.thumbnail, .manga-cover img, .imagebig img').first().attr('src') || ''
    const desc = $('.description-summary, .summary__content, #synopsis').first().text().trim() || ''
    let author = ''
    let status = MangaStatus.ONGOING
    const genres: Tag[] = []
    $('table.table tr, .srepetarz tr').each((_: number, row: cheerio.Element) => {
      const label = $('td', row).first().text().toLowerCase()
      const value = $('td', row).last().text().trim()
      if (label.includes('yazar')) author = value
      if (label.includes('durum')) status = value.toLowerCase().includes('tamam') ? MangaStatus.COMPLETED : MangaStatus.ONGOING
      if (label.includes('tür')) value.split(',').forEach((g: string) => { const t = g.trim(); if (t) genres.push(createTag({ id: t, label: t })) })
    })
    if (genres.length === 0) $('a[href*="tur="]').each((_: number, el: cheerio.Element) => { const g = $(el).text().trim(); if (g) genres.push(createTag({ id: g, label: g })) })
    const tagSections: TagSection[] = genres.length ? [createTagSection({ id: 'genres', label: 'Türler', tags: genres })] : []
    return createManga({ id: mangaId, titles: [title], image: image.startsWith('http') ? image : `${BASE_URL}${image}`, status, author, desc, tags: tagSections, rating: 0 })
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const url = `${BASE_URL}/${mangaId}.html`
    const request = createRequestObject({ url, method: 'GET' })
    const response = await this.requestManager.schedule(request, 1)
    const $ = this.cheerio.load(response.data)
    const chapters: Chapter[] = []
    $('table#chapter_list tr, .chapter-list li, .bolum-list tr').each((i: number, el: cheerio.Element) => {
      const link = $('a[href*="bolum"], a[href*="chapter"]', el).first()
      const href = link.attr('href') || ''
      if (!href) return
      const chapterTitle = link.text().trim()
      const numMatch = chapterTitle.match(/[\d.]+/)
      const chapNum = numMatch ? parseFloat(numMatch[0]) : i
      const chapterId = href.replace('.html', '').split('/').pop() || href
      chapters.push(createChapter({ id: chapterId, mangaId, name: chapterTitle || `Bölüm ${chapNum}`, chapNum, langCode: '🇹🇷' }))
    })
    return chapters.s
