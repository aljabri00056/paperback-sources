import {
    Chapter,
    LanguageCode,
    Manga,
    MangaStatus,
    MangaTile,
    Tag,
    TagSection
} from 'paperback-extensions-common'

// eslint-disable-next-line @typescript-eslint/no-var-requires
import CryptoJS = require('./external/crypto-js.min.js')

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
