// Vercel entry point for /api/<name>. Everything lives in server/.
import { dispatch } from "../server/router.js";

export default {
  fetch(request: Request): Promise<Response> {
    return dispatch(request);
  },
};
