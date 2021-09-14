import {
    Chapter,
    ChapterDetails,
    ContentRating,
    HomeSection,
    Manga,
    MangaUpdates,
    PagedResults,
    SearchRequest,
    Source,
    SourceInfo,
    LanguageCode,
    TagType,
    Request,
    RequestManager
} from 'paperback-extensions-common'

import { Parser } from './GMangaParser'

const GMANGA_DOMAIN = 'gmanga.org'
const GMANGA_BaseUrl = `https://${GMANGA_DOMAIN}`

export const GMangaInfo: SourceInfo = {
    author: 'aljabri00056',
    description: 'Extension that pulls manga from GManga',
    icon: 'icon.png',
    name: 'GManga',
    version: '1.0.0',
    authorWebsite: 'https://github.com/aljabri00056',
    websiteBaseURL: GMANGA_BaseUrl,
    contentRating: ContentRating.EVERYONE,
    language: LanguageCode.SANSKRIT,
    sourceTags: [
        {
            text: 'Arabic',
            type: TagType.BLUE,
        }
    ],
}


export class GManga extends Source {

    GMANGA_DOMAIN = GMANGA_DOMAIN
    GMANGA_BaseUrl = GMANGA_BaseUrl

    parser = new Parser()

    requestManager = createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
    })

    override getMangaShareUrl(mangaId: string): string {
        return `${this.GMANGA_BaseUrl}/mangas/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {

        const request = createRequestObject({
            url: `${this.GMANGA_BaseUrl}/api/mangas/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)

        const data = JSON.parse(response.data)

        return this.parser.parseMangaDetails(mangaId, data)

    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        throw new Error('Method not implemented.')
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        throw new Error('Method not implemented.')
    }

    async getSearchResults(query: SearchRequest, _metadata: any): Promise<PagedResults> {
        this.parser.mangaSearchBody.title = query.title ?? ''

        const request = createRequestObject({
            url: `${this.GMANGA_BaseUrl}/api/mangas/search`,
            method: 'POST',
            data: JSON.stringify(this.parser.mangaSearchBody),
            headers: {
                'content-type': 'application/json'
            }
        })

        const response = await this.requestManager.schedule(request, 1)

        const manga = this.parser.parseSearchResults(JSON.parse(response.data))

        return createPagedResults({ results: manga })

    }
}