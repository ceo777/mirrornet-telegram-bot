/**
 * MirrorNet Poster Telegram Bot
 *
 * Copyright © 2024 Oleg Dubnov
 * https://olegdubnov.com
 */

import Reddit from "./posters/reddit";


/** The main entry point to start all the posters asynchronously */
async function main(): Promise<void> {
    const reddit = new Reddit();
    // const x = new X();

    /* Starting Reddit poster */
    console.log(`Starting Reddit poster!`);
    reddit.start().catch(
        error => console.error(error.message)
    );

    /* Starting X (Twitter) poster (Not implemented yet) */
    // console.log(`Starting X (Twitter) poster!`);
    // x.start().catch(
    //     error => console.error(error.message)
    // );
}

main();