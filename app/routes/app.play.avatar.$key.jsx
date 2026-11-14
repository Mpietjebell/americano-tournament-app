import prisma from "../db.server";

/** Serves a user's or club's avatar image by its public key. */
export const loader = async ({ params }) => {
    const key = params.key;
    const owner =
        (await prisma.tournamentUser.findUnique({ where: { avatarKey: key }, select: { avatar: true } })) ||
        (await prisma.club.findUnique({ where: { avatarKey: key }, select: { avatar: true } }));
    const match = owner?.avatar?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) throw new Response("Not Found", { status: 404 });
    return new Response(Buffer.from(match[2], "base64"), {
        headers: {
            "Content-Type": match[1],
            // The key changes with every upload, so the image behind a key never changes.
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    });
};
