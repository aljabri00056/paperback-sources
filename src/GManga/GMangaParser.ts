import {
    Chapter,
    LanguageCode,
    Manga,
    MangaStatus,
    MangaTile,
} from 'paperback-extensions-common'

import * as _ from "lodash"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CryptoJS = require('./external/crypto-js.min.js')

export class Parser {

    mangaSearchBody = {
        title: '',
        manga_types: {
            include: ['1', '2', '3', '4', '5', '6', '7', '8'],
            exclude: []
        },
        story_status: { include: [], exclude: [] },
        translation_status: { include: [], exclude: [3] },
        categories: { include: [null], exclude: [] },
        chapters: { min: '', max: '' },
        dates: { start: null, end: null },
        page: 1
    };

    decryptResponse(t: string) {
        var e = t.split("|")
            , n = e[0]
            , r = e[2]
            , o = e[3]
            , i = CryptoJS.SHA256(o).toString()
            , a = CryptoJS.AES.decrypt({
                ciphertext: CryptoJS.enc.Base64.parse(n)
            }, CryptoJS.enc.Hex.parse(i), {
                iv: CryptoJS.enc.Base64.parse(r)
            });
        return JSON.parse(CryptoJS.enc.Utf8.stringify(a));
    }

    pack(data: any): any {
        let results, result, value, root

        results = []

        for (const t in data['rows']) {

            if (data['rows'][t].hasOwnProperty('rows')) {
                root = true
                results.push(this.pack(data['rows'][t]))

            } else {
                value = data['rows'][t]
                result = _.zipObject(data['cols'], value)
                result = _.isEmpty(result) ? undefined : result
                results.push(result)
            }
        }

        return (root ? _.zipObject(data['cols'], results) : results)
    }

    parseMangaDetails(mangaId: string, data: any): Manga {

        const mangaDetails = data.mangaData

        const status = mangaDetails.story_status == 2 ? MangaStatus.ONGOING : MangaStatus.COMPLETED

        return createManga({
            id: mangaId,
            titles: [mangaDetails.title],
            status: status,
            rating: 0,
            image: `https://media.gmanga.org/uploads/manga/cover/${mangaId}/${mangaDetails.cover}`
        })


    }

    parseChapters(mangaId: string, data: any): Chapter[] {
        const chapters: Chapter[] = []

        data = data['iv'] ? this.decryptResponse(data.data) : data;
        data = data['isCompact'] ? this.pack(data) : data;

        data.releases.map((chapter: any) => {
            const team = data.teams.find((t: any) => t.id === chapter.team_id);
            const chapterization = data.chapterizations.find((c: any) => c.id === chapter.chapterization_id);
            chapters.push(createChapter({
                id: [mangaId, 'manga-slug', chapterization.chapter, team.name].join('/'),
                mangaId: mangaId,
                volume: Number.isNaN(chapterization.volume) ? 0 : chapterization.volume,
                chapNum: Number(chapterization.chapter),
                group: team.name ?? '',
                langCode: LanguageCode.SANSKRIT,
                name: chapterization.title,
                time: new Date(chapterization.time_stamp * 1000)
            }))
        });

        console.log(`parseChapters: ${chapters.length} Chapter`)

        return chapters
    }

    parseChapterDetails($: any): string[] {
        const pages: string[] = []

        let data = $(".js-react-on-rails-component").html()
        data = JSON.parse(data)

        let url = (data.globals.wla.configs.http_media_server || data.globals.wla.configs.media_server) + '/uploads/releases/';

        data = data.readerDataAction.readerData.release;
        let images = [];

        if (data.pages && data.pages.length > 0) {
            images = data.pages.map((page: any) => '/hq/' + page);
        } else {
            images = data.webp_pages.map((page: any) => '/hq_webp/' + page);
        }

        images.map((image: any) => { pages.push(`${url}${data.storage_key + image}`) })

        return pages

    }

    parseSearchResults(data: any): MangaTile[] {
        const mangaTiles: MangaTile[] = []

        data = data['iv'] ? this.decryptResponse(data.data) : data;
        data = data.mangas || [];

        data.map((manga: any) => {
            mangaTiles.push(createMangaTile({
                id: JSON.stringify(manga.id),
                title: createIconText({ text: manga.title }),
                image: `https://media.gmanga.org/uploads/manga/cover/${manga.id}/${manga.cover}`
            }))
        })

        return mangaTiles

    }
}
