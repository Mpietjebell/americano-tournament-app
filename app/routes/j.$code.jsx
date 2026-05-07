import { redirect } from "@remix-run/node";

export const loader = ({ params }) => {
    return redirect(
        `https://nopabrand.com/pages/organise-americano?join=${params.code.toUpperCase()}`,
        { status: 302 }
    );
};
