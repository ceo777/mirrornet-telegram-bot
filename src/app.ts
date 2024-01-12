/** MirrorNet Poster Telegram Bot */

import Reddit from "./posters/reddit";

/** The main entry point to start all the posters asynchronously */
async function main(): Promise<void> {
    // const x = new X();
    const reddit = new Reddit();

    // x.start().catch(
    //     error => console.error(error)
    // );
    console.log(`Starting Reddit poster!`);
    reddit.start().catch(
        error => console.error(error.message)
    );
}

main();