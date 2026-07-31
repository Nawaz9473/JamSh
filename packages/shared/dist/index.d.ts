import { z } from 'zod';
export declare const signUpSchema: z.ZodObject<{
    username: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    email: string;
    password: string;
}, {
    username: string;
    email: string;
    password: string;
}>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export declare const signInSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type SignInInput = z.infer<typeof signInSchema>;
export declare const otpLoginSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const otpVerifySchema: z.ZodObject<{
    email: z.ZodString;
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    token: string;
}, {
    email: string;
    token: string;
}>;
export declare const profileSchema: z.ZodObject<{
    username: z.ZodString;
    display_name: z.ZodNullable<z.ZodString>;
    bio: z.ZodNullable<z.ZodString>;
    website: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodString]>>>;
}, "strip", z.ZodTypeAny, {
    username: string;
    display_name: string | null;
    bio: string | null;
    website?: string | null | undefined;
}, {
    username: string;
    display_name: string | null;
    bio: string | null;
    website?: string | null | undefined;
}>;
export type ProfileInput = z.infer<typeof profileSchema>;
export declare const postSchema: z.ZodObject<{
    content: z.ZodNullable<z.ZodString>;
    type: z.ZodEnum<["text", "image", "video", "multiple"]>;
    visibility: z.ZodEnum<["public", "private"]>;
    mediaUrls: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "text" | "image" | "video" | "multiple";
    content: string | null;
    visibility: "public" | "private";
    mediaUrls: string[];
}, {
    type: "text" | "image" | "video" | "multiple";
    content: string | null;
    visibility: "public" | "private";
    mediaUrls: string[];
}>;
export type PostInput = z.infer<typeof postSchema>;
export declare function formatThunderCount(count: number): string;
export declare function getDisplayName(profile: {
    username: string;
    display_name: string | null;
}): string;
export declare function timeAgo(dateString: string): string;
