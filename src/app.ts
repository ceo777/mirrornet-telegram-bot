/** MirrorNet Poster Telegram Bot */

import Reddit from "./posters/reddit";

/** The main entry point to start all the posters asynchronously */
async function main(): Promise<void> {
    // const x = new X();
    const reddit = new Reddit();

    // x.start().catch(
    //     error => console.error(error)
    // );
    reddit.start().catch(
        error => console.error(error)
    );
}

main();