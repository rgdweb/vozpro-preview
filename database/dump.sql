--
-- PostgreSQL database dump
--

\restrict Nfagn7GaH9GKcbHVDmcdxINe0eTZzHFrvnrzWvwdWYy94EhDXurNOu8Wr1wQ04Q

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public."VoiceVariation" DROP CONSTRAINT IF EXISTS "VoiceVariation_voiceId_fkey";
ALTER TABLE IF EXISTS ONLY public."Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Payment" DROP CONSTRAINT IF EXISTS "Payment_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."GenerationQueue" DROP CONSTRAINT IF EXISTS "GenerationQueue_userId_fkey";
DROP INDEX IF EXISTS public."User_googleId_key";
DROP INDEX IF EXISTS public."User_email_key";
DROP INDEX IF EXISTS public."SystemSetting_key_key";
DROP INDEX IF EXISTS public."Speaker_speakerFile_key";
DROP INDEX IF EXISTS public."Session_userId_idx";
DROP INDEX IF EXISTS public."Session_tokenHash_idx";
DROP INDEX IF EXISTS public."Payment_userId_idx";
DROP INDEX IF EXISTS public."Payment_status_idx";
DROP INDEX IF EXISTS public."Payment_externalRef_key";
DROP INDEX IF EXISTS public."Payment_externalRef_idx";
DROP INDEX IF EXISTS public."GenerationQueue_userId_idx";
DROP INDEX IF EXISTS public."GenerationQueue_status_idx";
DROP INDEX IF EXISTS public."GenerationQueue_createdAt_idx";
ALTER TABLE IF EXISTS ONLY public."Voice" DROP CONSTRAINT IF EXISTS "Voice_pkey";
ALTER TABLE IF EXISTS ONLY public."VoiceVariation" DROP CONSTRAINT IF EXISTS "VoiceVariation_pkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE IF EXISTS ONLY public."Track" DROP CONSTRAINT IF EXISTS "Track_pkey";
ALTER TABLE IF EXISTS ONLY public."SystemSetting" DROP CONSTRAINT IF EXISTS "SystemSetting_pkey";
ALTER TABLE IF EXISTS ONLY public."Speaker" DROP CONSTRAINT IF EXISTS "Speaker_pkey";
ALTER TABLE IF EXISTS ONLY public."Session" DROP CONSTRAINT IF EXISTS "Session_pkey";
ALTER TABLE IF EXISTS ONLY public."Payment" DROP CONSTRAINT IF EXISTS "Payment_pkey";
ALTER TABLE IF EXISTS ONLY public."GenerationQueue" DROP CONSTRAINT IF EXISTS "GenerationQueue_pkey";
DROP TABLE IF EXISTS public."VoiceVariation";
DROP TABLE IF EXISTS public."Voice";
DROP TABLE IF EXISTS public."User";
DROP TABLE IF EXISTS public."Track";
DROP TABLE IF EXISTS public."SystemSetting";
DROP TABLE IF EXISTS public."Speaker";
DROP TABLE IF EXISTS public."Session";
DROP TABLE IF EXISTS public."Payment";
DROP TABLE IF EXISTS public."GenerationQueue";
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: GenerationQueue; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."GenerationQueue" (
    id text NOT NULL,
    "userId" text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone
);


ALTER TABLE public."GenerationQueue" OWNER TO omnivoice;

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "externalRef" text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    amount double precision DEFAULT 1.0 NOT NULL,
    format text DEFAULT 'mp3'::text NOT NULL,
    "mpPaymentId" text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Payment" OWNER TO omnivoice;

--
-- Name: Session; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "deviceInfo" text DEFAULT ''::text NOT NULL,
    "ipAddress" text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Session" OWNER TO omnivoice;

--
-- Name: Speaker; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."Speaker" (
    id text NOT NULL,
    name text NOT NULL,
    "avatarUrl" text,
    "speakerFile" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "refAudioUrl" text DEFAULT ''::text NOT NULL,
    "refText" text DEFAULT ''::text NOT NULL
);


ALTER TABLE public."Speaker" OWNER TO omnivoice;

--
-- Name: SystemSetting; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."SystemSetting" (
    id text NOT NULL,
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SystemSetting" OWNER TO omnivoice;

--
-- Name: Track; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."Track" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    emoji text DEFAULT ''::text NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    "audioPath" text NOT NULL,
    duration double precision DEFAULT 0 NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Track" OWNER TO omnivoice;

--
-- Name: User; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."User" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "googleId" text DEFAULT ''::text NOT NULL,
    "freeDownloads" integer DEFAULT 5 NOT NULL,
    "paymentExempt" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO omnivoice;

--
-- Name: Voice; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."Voice" (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    gender text DEFAULT 'Auto'::text NOT NULL,
    age text DEFAULT 'Auto'::text NOT NULL,
    accent text DEFAULT 'Auto'::text NOT NULL,
    pitch text DEFAULT 'Auto'::text NOT NULL,
    "previewUrl" text DEFAULT ''::text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    category text DEFAULT ''::text NOT NULL
);


ALTER TABLE public."Voice" OWNER TO omnivoice;

--
-- Name: VoiceVariation; Type: TABLE; Schema: public; Owner: omnivoice
--

CREATE TABLE public."VoiceVariation" (
    id text NOT NULL,
    "voiceId" text NOT NULL,
    label text NOT NULL,
    emoji text DEFAULT ''::text NOT NULL,
    "refAudioPath" text DEFAULT ''::text NOT NULL,
    "refAudioServerUrl" text DEFAULT ''::text NOT NULL,
    "refAudioFilename" text DEFAULT ''::text NOT NULL,
    "refAudioName" text DEFAULT ''::text NOT NULL,
    "refText" text DEFAULT ''::text NOT NULL,
    instruct text DEFAULT ''::text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "defaultSpeed" double precision DEFAULT 1.0 NOT NULL
);


ALTER TABLE public."VoiceVariation" OWNER TO omnivoice;

--
-- Data for Name: GenerationQueue; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."GenerationQueue" (id, "userId", status, "position", "createdAt", "startedAt", "completedAt") FROM stdin;
cmq2ne4vu00058upy5aietb7x	cmplln2dv0000jy04c6kicu46	failed	0	2026-06-06 17:49:33.883	2026-06-06 17:49:33.882	2026-06-06 18:35:51.544
cmq2p1xvy00078upy3g2g8hvq	cmplln2dv0000jy04c6kicu46	processing	0	2026-06-06 18:36:04.174	2026-06-06 18:36:04.173	\N
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."Payment" (id, "userId", "externalRef", status, amount, format, "mpPaymentId", "createdAt", "updatedAt") FROM stdin;
cmpncf07b0001jp041g0ikmwi	cmplln2dv0000jy04c6kicu46	vozpro_1de808e6-6e16-4c40-97db-652eddde750d	pending	3	mp3		2026-05-27 00:45:46.055	2026-05-27 00:45:46.055
cmpncfygd0001l204i1bbgt52	cmplln2dv0000jy04c6kicu46	vozpro_c575b948-8461-48b5-baf2-6a87e5bf2a2a	pending	3	mp3		2026-05-27 00:46:30.446	2026-05-27 00:46:30.446
cmpymubmz00038ulo9s4ah3cu	cmplln2dv0000jy04c6kicu46	vozpro_9231e199-d7c8-445b-beaf-df96fbfbe038	pending	3	mp3		2026-06-03 22:23:04.811	2026-06-03 22:23:04.811
cmpzknlyn00058uudgnm1mexd	cmplln2dv0000jy04c6kicu46	vozpro_9e306467-f571-4d01-b7b8-7ce1f7ee5644	pending	3	mp3		2026-06-04 14:09:38.543	2026-06-04 14:09:38.543
\.


--
-- Data for Name: Session; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."Session" (id, "userId", "tokenHash", "deviceInfo", "ipAddress", "createdAt", "expiresAt") FROM stdin;
cmplzeps70003l704v1ixn3tr	cmplln2dv0000jy04c6kicu46	1629844414cd0b8f21ac295cc691644be926b8caf0e41ec71243f7310a13bd42	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.176.43	2026-05-26 01:53:51.368	2026-05-27 01:53:51.367
cmpmtkios0001jy04xhte5h4v	cmplln2dv0000jy04c6kicu46	4ba5af5a956a2fc6756eb3ecd61031c691243e61e3a6b9bd95109a074a39d5a5	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36	189.40.69.230	2026-05-26 15:58:10.588	2026-05-27 15:58:10.587
cmponxl7x0001l504677f6i6n	cmplln2dv0000jy04c6kicu46	87b296037cbaf9d4ff250e58d238b7c50b558fe07b8c83bf9c29e99f2c9ce99e	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.177.243	2026-05-27 22:55:55.054	2026-05-28 22:55:55.052
cmpq3uu720001l804x04hgfem	cmplln2dv0000jy04c6kicu46	90a53b2af0ad4449d117aae8e076acee6cdb3031dd18347926300544e2310a8f	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.176.155	2026-05-28 23:09:26.75	2026-05-29 23:09:26.749
cmpr7nede0001l204ktro447n	cmplof4dd0000l504byohmh61	0c49119563c425ec724d856e6531702c9bd9a647c49b47c2731b324144e84e1d	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36	45.172.129.81	2026-05-29 17:43:24.291	2026-05-30 17:43:24.057
cmprtd3p000018u6lxgczaldy	cmplln2dv0000jy04c6kicu46	be02b70165df011cd6ebbdd8a26a9d460125a7bed1518d0796b785e4a80a8790	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.178.232	2026-05-30 03:51:15.445	2026-05-31 03:51:15.443
cmpsadqox00038usx51x3p9in	cmplln2dv0000jy04c6kicu46	712a55375033f3a7068e8d10b87212279a4d6773a9be5b2b545ea1c5a8bb0c6c	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.178.232	2026-05-30 11:47:38.722	2026-05-31 11:47:38.721
cmpts8cs2000c8ugc5z4khpsf	cmplln2dv0000jy04c6kicu46	e2860033515ccdd6f5ea0e65302b4f2e8dc2ff0d8a709f34cc680e95b7429c62	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.177.150	2026-05-31 12:55:06.674	2026-06-01 12:55:06.673
cmptycb4f00018uuq9uud6fjx	cmplln2dv0000jy04c6kicu46	093ead784102afc760855a96cb56a2df1d03cf79e7d8694a52de461a0b6473df	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36	177.36.177.150	2026-05-31 15:46:08.847	2026-06-01 15:46:08.846
cmptyobxl00018unrz4dskttu	cmplln2dv0000jy04c6kicu46	50382ee121403e42b8597954494dea97a2ae478b811e1184b8c7a0d609a67b78	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.177.150	2026-05-31 15:55:29.769	2026-06-01 15:55:29.768
cmpv96bmu00018uyjd7s3yhbp	cmplln2dv0000jy04c6kicu46	3028cf54f931ebff18873a268d2fec8298df4580714fde06d5062de8701617b1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.178.108	2026-06-01 13:37:11.526	2026-06-02 13:37:11.525
cmpvlce2m000d8uyj6g41klm3	cmplln2dv0000jy04c6kicu46	14208c43daf0d310bdd7c305c8973aed569600e70f38f42c6b29a50fe700f9f6	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36	177.36.178.108	2026-06-01 19:17:50.014	2026-06-02 19:17:50.013
cmpwoo3am00058uag8cb90fpg	cmplln2dv0000jy04c6kicu46	9bf98cce5bef6d2038df8f77b5180dea367d226a520a3cc782d724d491a4bbbe	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.176.237	2026-06-02 13:38:40.942	2026-06-03 13:38:40.941
cmpy85dxo00088ugepilu0xlw	cmplln2dv0000jy04c6kicu46	cfe14b3cf589df7c55a6d54bb6445a64a2f70b1664534a6557eacfbe9ccbb46c	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36	189.4.79.228	2026-06-03 15:31:46.765	2026-06-04 15:31:46.764
cmpymuu5800058ulos8nssjsz	cmplln2dv0000jy04c6kicu46	9d71ee00fa778b0b6562e3ccdae037015dd10cc52f41f5c74dcae6aeb8156e90	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.177.221	2026-06-03 22:23:28.796	2026-06-04 22:23:28.795
cmpzdxh0000018u1yc6rals55	cmplnkvu90000l204lqgf6kw4	ab5b8fac60bc03b96b661b79b4dab6b52f4f14503e88e2dcedfab99b9da92551	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36	45.225.160.70	2026-06-04 11:01:21.36	2026-06-05 11:01:21.356
cmq02dbi000018uin5eo56jyx	cmplln2dv0000jy04c6kicu46	2dbaf58c8ef4a449a5151f48cc6f53373d22f6cbf2e9fb4483ed95b505753203	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.178.11	2026-06-04 22:25:31.512	2026-06-05 22:25:31.511
cmq02dh1900038uinlmhs64le	cmplln2dv0000jy04c6kicu46	5319156f6135892ab2db3a40d47468b5b2f3c1c15e989bb71f33a74df1004d0d	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.178.11	2026-06-04 22:25:38.685	2026-06-05 22:25:38.684
cmq050boj00038uq7fwpkqzl1	cmplln2dv0000jy04c6kicu46	b61df662942c76569773db9dc22ccb71032a6e046834d397499b4235df81de99	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0	177.36.178.11	2026-06-04 23:39:24.067	2026-06-05 23:39:24.066
cmq1i6a2b00018ui0c4vntp8n	cmplln2dv0000jy04c6kicu46	b9364f5ec1cec037274015a9e2b99c242e168956c2c3e296db57b4754892dcba	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	177.36.176.208	2026-06-05 22:35:43.092	2026-06-06 22:35:43.09
cmq1x7if600018u568ckq04xl	cmplln2dv0000jy04c6kicu46	de3ae53173ba227da878877f92adc05291705c4dab8774c45bd64e071e25ca42	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	177.36.176.208	2026-06-06 05:36:34.819	2026-06-07 05:36:34.817
cmq2e9ohf00038u56lurpd7hl	cmplzhonw0000jl04d4s86byx	7e5b7acee6d2e0865ffa19958fbbbed4c1c91b43ef3919528fd0df37a4435e95	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36	177.174.246.186	2026-06-06 13:34:09.46	2026-06-07 13:34:09.456
cmq2mcw5o00018uv98cigy6ph	cmplln2dv0000jy04c6kicu46	6d19b6177fdfbdb73fd8d68596cd756364a38bad19f77cae6682da0731631baf	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36	177.36.177.197	2026-06-06 17:20:36.301	2026-06-07 17:20:36.299
\.


--
-- Data for Name: Speaker; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."Speaker" (id, name, "avatarUrl", "speakerFile", "isActive", "createdAt", "updatedAt", "refAudioUrl", "refText") FROM stdin;
328897b7-705b-45a3-a611-ecd5dfb26809	Aline Dias — Locução Calma	\N	aline_dias_locucao_calma.wav	t	2026-06-05 03:35:29.703	2026-06-05 03:35:29.703	https://api.cvmnews.com.br/audios/ref/6a179b4e3fc9d_1779931982.wav	
\.


--
-- Data for Name: SystemSetting; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."SystemSetting" (id, key, value, "createdAt", "updatedAt") FROM stdin;
94a26baa-dadd-41d1-b31c-cdbbb19c1a11	error	Não autorizado	2026-05-26 00:00:00	2026-05-26 00:00:00
86d060ff-2b84-432b-b8a8-2290f38768c9	googleClientId	450354219066-jqk4t25lqlivgqudg68bjej94m5328ns.apps.googleusercontent.com	2026-05-25 20:18:08.284	2026-05-25 20:18:08.284
cmploch080003l704m05ub1bp	enableVoiceUpload	true	2026-05-25 20:44:10.904	2026-05-25 20:44:10.904
cmpuplt0i00218udboyl2ss5x	managed_track_categories	[{"name":"ALEGRE","emoji":"😄"},{"name":"BOSSA","emoji":"🎷"},{"name":"CINEMA","emoji":"🎬"},{"name":"DRUMSTEP","emoji":"🥁"},{"name":"EFEITOS","emoji":"💥"},{"name":"HIP HOP","emoji":"🎤"},{"name":"JAZZ","emoji":"🎷"},{"name":"LOUNGE","emoji":"🛋️"},{"name":"NEWS","emoji":"📰"},{"name":"REGGAE","emoji":"🌴"},{"name":"ROCK","emoji":"🎸"},{"name":"TANGO","emoji":"💃"},{"name":"TECNOLOGIA","emoji":"💻"},{"name":"TRAILER","emoji":"🎥"},{"name":"URBANO","emoji":"🏙️"},{"name":"VINHETAS","emoji":"📻"},{"name":"IMPACTANTES","emoji":"⚡"},{"name":"SEXY","emoji":"😈​"},{"name":"institucional","emoji":"​🏤​"},{"name":"Dia das Mães","emoji":"👩🏻‍🍼​"},{"name":"trilhas agitadas","emoji":"🎶​"},{"name":"IGREJA","emoji":"⛪​"}]	2026-06-01 04:29:21.571	2026-06-01 04:37:14.201
cmplzc7r50000l804hywbvzek	paywallEnabled	true	2026-05-26 01:51:54.689	2026-05-26 01:51:54.689
cmplxwb5n0001jv043st498jp	watermarkAudioPath	http://147.15.77.137/audios/ref/6a1621303857e_1779835184.wav	2026-05-26 01:11:32.988	2026-05-26 22:39:44.837
cmpncdtv50000jr041sfukvzp	paymentAmount	3.00	2026-05-27 00:44:51.185	2026-05-27 00:44:51.185
cmplmvs610000lf04ooezqjs2	mercadopagoAccessToken	APP_USR-629098849223625-032116-8fab4d63ac00bdb57e133f89d21912a0-3199809201	2026-05-25 20:03:12.601	2026-05-27 00:45:25.37
cmpnci5730001js0498b9evf8	freeDownloadsPerAccount	5	2026-05-27 00:48:12.496	2026-05-27 00:48:19.012
cmplx5ty60000js049av7qtmo	watermarkVolume	0.18	2026-05-26 00:50:57.63	2026-05-27 01:10:11.858
cmpm0fnbe0001le04oa8jzdk6	managed_voice_categories	[{"name":"Graves","emoji":"🎙️"},{"name":"Super Graves","emoji":"🔊"},{"name":"Festas","emoji":"🎉"},{"name":"Igrejas","emoji":"⛪"},{"name":"Mercado","emoji":"🛒"},{"name":"Vinheta","emoji":"📻"},{"name":"Vozes Famosas","emoji":"⭐"},{"name":"Vozes Inéditas","emoji":"🆕"},{"name":"Narradores","emoji":"📖"},{"name":"Vendas","emoji":"💼"},{"name":"Infantil","emoji":"🧒"},{"name":"Idoso","emoji":"👴"},{"name":"Feminina","emoji":"👩🏼"}]	2026-05-26 02:22:34.443	2026-06-01 04:28:35.598
\.


--
-- Data for Name: Track; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."Track" (id, name, description, emoji, category, "audioPath", duration, "order", active, "createdAt", "updatedAt") FROM stdin;
cmoxtf6za000bjv04rx5d0ssg	Hollywood Traffic Jam - Doug Maxwell_Media Right Productions			IMPACTANTES	/audios/track/69feb1337e72d_1778299187.mp3	0	0	t	2026-05-09 03:59:47.735	2026-05-09 03:59:47.735
cmoxtf8ww000cjv04x5e9wfbn	Midnight Trace - Jimena Contreras			IMPACTANTES	/audios/track/69feb135deb4d_1778299189.mp3	0	0	t	2026-05-09 03:59:50.126	2026-05-09 03:59:50.126
cmoxtf9nx000djv04j2866jgz	Night Hunt - Jimena Contreras			IMPACTANTES	/audios/track/69feb136f3fd4_1778299190.mp3	0	0	t	2026-05-09 03:59:51.214	2026-05-09 03:59:51.214
cmoxtfay3000ejv04mg8m0j9p	Restless Heart - Jimena Contreras			IMPACTANTES	/audios/track/69feb138a1393_1778299192.mp3	0	0	t	2026-05-09 03:59:52.875	2026-05-09 03:59:52.875
cmoxtfbdz000fjv04io9a2por	Ready for More - Ezra Lipp			IMPACTANTES	/audios/track/69feb1392eed1_1778299193.mp3	0	0	t	2026-05-09 03:59:53.447	2026-05-09 03:59:53.447
cmoxtfcq6000gjv04fdeqotkd	Rogue Force - Jimena Contreras			IMPACTANTES	/audios/track/69feb13aead2e_1778299194.mp3	0	0	t	2026-05-09 03:59:55.183	2026-05-09 03:59:55.183
cmoxtfd8j000hjv04d4j1n3xr	Shadow Chase - Jimena Contreras			IMPACTANTES	/audios/track/69feb13b996bd_1778299195.mp3	0	0	t	2026-05-09 03:59:55.843	2026-05-09 03:59:55.843
cmoxtfect000ijv04y1n1pmi1	Splinters Lair - Ezra Lipp			IMPACTANTES	/audios/track/69feb13d12871_1778299197.mp3	0	0	t	2026-05-09 03:59:57.294	2026-05-09 03:59:57.294
cmoxtfg3p000jjv04ypkasyd1	The Bronx is Burning - Doug Maxwell_Media Right Productions			IMPACTANTES	/audios/track/69feb13f52196_1778299199.mp3	0	0	t	2026-05-09 03:59:59.558	2026-05-09 03:59:59.558
cmoxtfh0q000kjv04gl6opb0p	The Challenger - The Soundings			IMPACTANTES	/audios/track/69feb14077a1f_1778299200.mp3	0	0	t	2026-05-09 04:00:00.746	2026-05-09 04:00:00.746
cmoxtfhxz000ljv04ntuv0dor	The New Order - Aaron Kenny			IMPACTANTES	/audios/track/69feb141b1455_1778299201.mp3	0	0	t	2026-05-09 04:00:01.943	2026-05-09 04:00:01.943
cmoxtfixn000mjv04eyldo06l	Timpani For The Devil - Ezra Lipp			IMPACTANTES	/audios/track/69feb14301cd3_1778299203.mp3	0	0	t	2026-05-09 04:00:03.227	2026-05-09 04:00:03.227
cmoxuaoq60000ld0438g9qu1t	CINEMA (1)			CINEMA	/audios/track/69feb6f0a9cfb_1778300656.mp3	0	0	t	2026-05-09 04:24:16.956	2026-05-09 04:24:16.956
cmoxuaso10001ld04neake6jj	CINEMA (2)			CINEMA	/audios/track/69feb6f534887_1778300661.mp3	0	0	t	2026-05-09 04:24:21.474	2026-05-09 04:24:21.474
cmoxuawqh0002ld04qi3pcvzn	CINEMA (3)			CINEMA	/audios/track/69feb6fb1f7d5_1778300667.mp3	0	0	t	2026-05-09 04:24:27.449	2026-05-09 04:24:27.449
cmoxub0gd0003ld04fw9hs5th	CINEMA (4)			CINEMA	/audios/track/69feb6ffe63b0_1778300671.mp3	0	0	t	2026-05-09 04:24:32.269	2026-05-09 04:24:32.269
cmoxub3cr0004ld04g7te2cyk	CINEMA (5)			CINEMA	/audios/track/69feb703c10d3_1778300675.mp3	0	0	t	2026-05-09 04:24:36.028	2026-05-09 04:24:36.028
cmoxub6ek0005ld04itchr17n	CINEMA (6)			CINEMA	/audios/track/69feb707993bb_1778300679.mp3	0	0	t	2026-05-09 04:24:39.867	2026-05-09 04:24:39.867
cmoxub9f90006ld04k9mo9n4s	CINEMA (7)			CINEMA	/audios/track/69feb70b8b8ff_1778300683.mp3	0	0	t	2026-05-09 04:24:43.894	2026-05-09 04:24:43.894
cmoxubctw0007ld04je1i8lh2	CINEMA (8)			CINEMA	/audios/track/69feb71011ca6_1778300688.mp3	0	0	t	2026-05-09 04:24:48.308	2026-05-09 04:24:48.308
cmoxubfps0008ld0435xixr5l	CINEMA (9)			CINEMA	/audios/track/69feb713c91ce_1778300691.mp3	0	0	t	2026-05-09 04:24:52.048	2026-05-09 04:24:52.048
cmoxubiy40009ld049190i9pm	CINEMA (10)			CINEMA	/audios/track/69feb717d6044_1778300695.mp3	0	0	t	2026-05-09 04:24:56.123	2026-05-09 04:24:56.123
cmoxublxy000ald04vnkknqxq	CINEMA (11)			CINEMA	/audios/track/69feb71bdad18_1778300699.mp3	0	0	t	2026-05-09 04:25:00.119	2026-05-09 04:25:00.119
cmoxubphk000bld041xhyenp2	CINEMA (12)			CINEMA	/audios/track/69feb72076f23_1778300704.mp3	0	0	t	2026-05-09 04:25:04.712	2026-05-09 04:25:04.712
cmoxubt82000cld04s7ej2v7e	CINEMA (13)			CINEMA	/audios/track/69feb72551012_1778300709.mp3	0	0	t	2026-05-09 04:25:09.554	2026-05-09 04:25:09.554
cmoxubwxs000dld04rherzuww	CINEMA (14)			CINEMA	/audios/track/69feb72a09afa_1778300714.mp3	0	0	t	2026-05-09 04:25:14.256	2026-05-09 04:25:14.256
cmoxuc4ow000fld042qpq7aqw	CINEMA (16)			CINEMA	/audios/track/69feb7342be98_1778300724.mp3	0	0	t	2026-05-09 04:25:24.416	2026-05-09 04:25:24.416
cmoxuc8pb000gld0406w3izeo	CINEMA (17)			CINEMA	/audios/track/69feb73944db9_1778300729.mp3	0	0	t	2026-05-09 04:25:29.502	2026-05-09 04:25:29.502
cmoxucci0000hld04gdtgsxfy	CINEMA (18)			CINEMA	/audios/track/69feb73e4cbc7_1778300734.mp3	0	0	t	2026-05-09 04:25:34.536	2026-05-09 04:25:34.536
cmoxucgkb000ild04n7tyy833	CINEMA (19)			CINEMA	/audios/track/69feb7438e431_1778300739.mp3	0	0	t	2026-05-09 04:25:39.803	2026-05-09 04:25:39.803
cmoxuckir000jld047ple3k61	CINEMA (20)			CINEMA	/audios/track/69feb74893056_1778300744.mp3	0	0	t	2026-05-09 04:25:44.818	2026-05-09 04:25:44.818
cmoxucpva0000l404h7k4d0ga	CINEMA (21)			CINEMA	/audios/track/69feb74e4b74b_1778300750.mp3	0	0	t	2026-05-09 04:25:51.859	2026-05-09 04:25:51.859
cmoxucto90001l4042dd9l0wo	CINEMA (22)			CINEMA	/audios/track/69feb754897d3_1778300756.mp3	0	0	t	2026-05-09 04:25:56.793	2026-05-09 04:25:56.793
cmoxucxhd0002l404qgfhpz2c	CINEMA (23)			CINEMA	/audios/track/69feb7596fc59_1778300761.mp3	0	0	t	2026-05-09 04:26:01.73	2026-05-09 04:26:01.73
cmoxud2810000l1045u6kd475	CINEMA (24)			CINEMA	/audios/track/69feb75ea2149_1778300766.mp3	0	0	t	2026-05-09 04:26:07.87	2026-05-09 04:26:07.87
cmoxud60w0001l1049qvex86d	CINEMA (25)			CINEMA	/audios/track/69feb7648c787_1778300772.mp3	0	0	t	2026-05-09 04:26:12.801	2026-05-09 04:26:12.801
cmoxud9so0002l104khwzuojf	CINEMA (26)			CINEMA	/audios/track/69feb7696cbde_1778300777.mp3	0	0	t	2026-05-09 04:26:17.688	2026-05-09 04:26:17.688
cmoxuddnp0003l104v1lasw3d	CINEMA (27)			CINEMA	/audios/track/69feb76e689a7_1778300782.mp3	0	0	t	2026-05-09 04:26:22.693	2026-05-09 04:26:22.693
cmoxudhsk0004l1045wsxutug	CINEMA (28)			CINEMA	/audios/track/69feb773aa399_1778300787.mp3	0	0	t	2026-05-09 04:26:27.938	2026-05-09 04:26:27.938
cmoxudl9g0005l10474xyf0b8	CINEMA (29)			CINEMA	/audios/track/69feb7784e1c7_1778300792.mp3	0	0	t	2026-05-09 04:26:32.549	2026-05-09 04:26:32.549
cmoxudpe20006l10457s4uek8	CINEMA (30)			CINEMA	/audios/track/69feb77da29b4_1778300797.mp3	0	0	t	2026-05-09 04:26:37.898	2026-05-09 04:26:37.898
cmoxudswz0007l1042aes7klc	CINEMA (31)			CINEMA	/audios/track/69feb7823c367_1778300802.mp3	0	0	t	2026-05-09 04:26:42.468	2026-05-09 04:26:42.468
cmoxue4gx0008l104yr4ttozy	CINEMA (33)			CINEMA	/audios/track/69feb7911a28a_1778300817.mp3	0	0	t	2026-05-09 04:26:57.327	2026-05-09 04:26:57.327
cmoxueg8i0009l1046q9kfh0s	CINEMA (35)			CINEMA	/audios/track/69feb7a053ed4_1778300832.mp3	0	0	t	2026-05-09 04:27:12.576	2026-05-09 04:27:12.576
cmoxuek9f000al104tu9ilrh2	CINEMA (36)			CINEMA	/audios/track/69feb7a5a984c_1778300837.mp3	0	0	t	2026-05-09 04:27:17.907	2026-05-09 04:27:17.907
cmoxuenpo000bl104shswaqul	CINEMA (37)			CINEMA	/audios/track/69feb7aa1f75a_1778300842.mp3	0	0	t	2026-05-09 04:27:22.381	2026-05-09 04:27:22.381
cmoxuezcl000cl1040ughe2r1	CINEMA (39)			CINEMA	/audios/track/69feb7b91f63e_1778300857.mp3	0	0	t	2026-05-09 04:27:37.348	2026-05-09 04:27:37.348
cmoxuf35c000dl104l4ai6lfp	CINEMA (40)			CINEMA	/audios/track/69feb7be28118_1778300862.mp3	0	0	t	2026-05-09 04:27:42.385	2026-05-09 04:27:42.385
cmoxuf73l000el104h81gtc9h	CINEMA (41)			CINEMA	/audios/track/69feb7c3440be_1778300867.mp3	0	0	t	2026-05-09 04:27:47.505	2026-05-09 04:27:47.505
cmoxufb1f000fl104a5niyz3r	CINEMA (42)			CINEMA	/audios/track/69feb7c844dc3_1778300872.mp3	0	0	t	2026-05-09 04:27:52.496	2026-05-09 04:27:52.496
cmoxufeq6000gl104ao04tk2f	CINEMA (43)			CINEMA	/audios/track/69feb7cd2807f_1778300877.mp3	0	0	t	2026-05-09 04:27:57.391	2026-05-09 04:27:57.391
cmoxufijh000hl104obc9mdn1	CINEMA (44)			CINEMA	/audios/track/69feb7d21a793_1778300882.mp3	0	0	t	2026-05-09 04:28:02.334	2026-05-09 04:28:02.334
cmoxuc149000eld04zc9qcm1i	CINEMA (15)			CINEMA	/audios/track/69feb72f8666d_1778300719.mp3	0	0	t	2026-05-09 04:25:19.786	2026-05-09 04:25:19.786
cmoxuflho000il104iwei3vz3	CINEMA (45)			CINEMA	/audios/track/69feb7d5df75f_1778300885.mp3	0	0	t	2026-05-09 04:28:06.156	2026-05-09 04:28:06.156
cmoxufovw000jl104xm1t1yca	CINEMA (46)			CINEMA	/audios/track/69feb7da32327_1778300890.mp3	0	0	t	2026-05-09 04:28:10.442	2026-05-09 04:28:10.442
cmoxufrp1000kl1042mjvr5rj	CINEMA (47)			CINEMA	/audios/track/69feb7ddee3d5_1778300893.mp3	0	0	t	2026-05-09 04:28:14.198	2026-05-09 04:28:14.198
cmoxufupi000ll1041s9x59pi	CINEMA (48)			CINEMA	/audios/track/69feb7e1d4b88_1778300897.mp3	0	0	t	2026-05-09 04:28:18.102	2026-05-09 04:28:18.102
cmoxufxuq000ml104nrbbj74k	CINEMA (49)			CINEMA	/audios/track/69feb7e5ea80d_1778300901.mp3	0	0	t	2026-05-09 04:28:22.178	2026-05-09 04:28:22.178
cmoxul8n30000jy04ko8bkwto	NEWS (1)			NEWS	/audios/track/69feb8dc18860_1778301148.mp3	0	0	t	2026-05-09 04:32:29.436	2026-05-09 04:32:29.436
cmoxulbvs0001jy04vefnv0rs	NEWS (2)			NEWS	/audios/track/69feb8e165f86_1778301153.mp3	0	0	t	2026-05-09 04:32:33.64	2026-05-09 04:32:33.64
cmoxuliv00002jy046d4kv6qf	NEWS (3)			NEWS	/audios/track/69feb8ea61dab_1778301162.mp3	0	0	t	2026-05-09 04:32:42.685	2026-05-09 04:32:42.685
cmoxulkth0003jy04fo5rjlud	NEWS (4)			NEWS	/audios/track/69feb8eccf811_1778301164.mp3	0	0	t	2026-05-09 04:32:45.109	2026-05-09 04:32:45.109
cmoxuln5l0004jy04znn7q1uw	NEWS (5)			NEWS	/audios/track/69feb8efef5bb_1778301167.mp3	0	0	t	2026-05-09 04:32:48.249	2026-05-09 04:32:48.249
cmoxulrzf0006jy04axn6r6dr	NEWS (7)			NEWS	/audios/track/69feb8f6465fa_1778301174.mp3	0	0	t	2026-05-09 04:32:54.507	2026-05-09 04:32:54.507
cmoxulu3y0007jy04x79d7mvq	NEWS (8)			NEWS	/audios/track/69feb8f90890a_1778301177.mp3	0	0	t	2026-05-09 04:32:57.263	2026-05-09 04:32:57.263
cmoxulw6b0008jy04pfh4c8t6	NEWS (9)			NEWS	/audios/track/69feb8fbaefa9_1778301179.mp3	0	0	t	2026-05-09 04:32:59.939	2026-05-09 04:32:59.939
cmoxulyz80009jy04aot6iumm	NEWS (10)			NEWS	/audios/track/69feb8ff33547_1778301183.mp3	0	0	t	2026-05-09 04:33:03.443	2026-05-09 04:33:03.443
cmoxum1dv000ajy04v5535fu4	NEWS (11)			NEWS	/audios/track/69feb90271997_1778301186.mp3	0	0	t	2026-05-09 04:33:06.691	2026-05-09 04:33:06.691
cmoxum39z000bjy04zfmn8oke	NEWS (12)			NEWS	/audios/track/69feb904e0f25_1778301188.mp3	0	0	t	2026-05-09 04:33:09.143	2026-05-09 04:33:09.143
cmoxum6b0000cjy04twj2qy9o	NEWS (13)			NEWS	/audios/track/69feb908ce51c_1778301192.mp3	0	0	t	2026-05-09 04:33:13.068	2026-05-09 04:33:13.068
cmoxum8sw000djy04ordmtuv0	NEWS (14)			NEWS	/audios/track/69feb90c158cd_1778301196.mp3	0	0	t	2026-05-09 04:33:16.305	2026-05-09 04:33:16.305
cmoxumb5o000ejy04kct8356h	NEWS (15)			NEWS	/audios/track/69feb90f04fd7_1778301199.mp3	0	0	t	2026-05-09 04:33:19.244	2026-05-09 04:33:19.244
cmoxumhn0000fjy04bh92961e	NEWS (16)			NEWS	/audios/track/69feb91782e3c_1778301207.mp3	0	0	t	2026-05-09 04:33:27.756	2026-05-09 04:33:27.756
cmoxumkku000gjy04tzfeku08	NEWS (17)			NEWS	/audios/track/69feb91b55558_1778301211.mp3	0	0	t	2026-05-09 04:33:31.567	2026-05-09 04:33:31.567
cmoxumn8g000hjy040q6g3w3s	NEWS (18)			NEWS	/audios/track/69feb91ea6c3d_1778301214.mp3	0	0	t	2026-05-09 04:33:34.896	2026-05-09 04:33:34.896
cmoxumpw7000ijy04g0vy406o	NEWS (19)			NEWS	/audios/track/69feb9223ac72_1778301218.mp3	0	0	t	2026-05-09 04:33:38.456	2026-05-09 04:33:38.456
cmoxumsrm000jjy04fmhy6un8	NEWS (20)			NEWS	/audios/track/69feb925eb551_1778301221.mp3	0	0	t	2026-05-09 04:33:42.178	2026-05-09 04:33:42.178
cmoxumvbk000kjy04avfk3dws	NEWS (21)			NEWS	/audios/track/69feb929424f2_1778301225.mp3	0	0	t	2026-05-09 04:33:45.489	2026-05-09 04:33:45.489
cmoxumzjz0000l80485iubfwq	NEWS (22)			NEWS	/audios/track/69feb92d665e8_1778301229.mp3	0	0	t	2026-05-09 04:33:50.269	2026-05-09 04:33:50.269
cmoxun2m00001l804988hicjx	NEWS (23)			NEWS	/audios/track/69feb932afdb3_1778301234.mp3	0	0	t	2026-05-09 04:33:54.937	2026-05-09 04:33:54.937
cmoxun65w0002l804q2b9cqnz	NEWS (24)			NEWS	/audios/track/69feb9374c549_1778301239.mp3	0	0	t	2026-05-09 04:33:59.54	2026-05-09 04:33:59.54
cmoxuncpr0003l804fzd53dkm	NEWS (25)			NEWS	/audios/track/69feb93f9f9df_1778301247.mp3	0	0	t	2026-05-09 04:34:07.917	2026-05-09 04:34:07.917
cmoxunfq20004l804abw60cnf	NEWS (26)			NEWS	/audios/track/69feb943aa775_1778301251.mp3	0	0	t	2026-05-09 04:34:11.93	2026-05-09 04:34:11.93
cmoxunia10005l804voh1d447	NEWS (27)			NEWS	/audios/track/69feb94704ec9_1778301255.mp3	0	0	t	2026-05-09 04:34:15.242	2026-05-09 04:34:15.242
cmoxunors0006l804cwqhpivy	NEWS (28)			NEWS	/audios/track/69feb94f4cd69_1778301263.mp3	0	0	t	2026-05-09 04:34:23.542	2026-05-09 04:34:23.542
cmoxuns1i0007l804d29gmslp	NEWS (29)			NEWS	/audios/track/69feb953a4f60_1778301267.mp3	0	0	t	2026-05-09 04:34:27.895	2026-05-09 04:34:27.895
cmoxunyg80008l804dkypmlin	NEWS (30)			NEWS	/audios/track/69feb95bef7d6_1778301275.mp3	0	0	t	2026-05-09 04:34:36.2	2026-05-09 04:34:36.2
cmoxuo4vh0009l804q751cv32	NEWS (31)			NEWS	/audios/track/69feb9642e26f_1778301284.mp3	0	0	t	2026-05-09 04:34:44.412	2026-05-09 04:34:44.412
cmoxuob94000al804dldbjlfp	NEWS (32)			NEWS	/audios/track/69feb96c8ad70_1778301292.mp3	0	0	t	2026-05-09 04:34:52.792	2026-05-09 04:34:52.792
cmoxuoe5e000bl8040ku2027j	NEWS (33)			NEWS	/audios/track/69feb9704f7b5_1778301296.mp3	0	0	t	2026-05-09 04:34:56.546	2026-05-09 04:34:56.546
cmoxuqi600000i504p3f7j8kp	INSTITUCIONAIS (1)			institucional	/audios/track/69feb9d2a3db1_1778301394.mp3	0	0	t	2026-05-09 04:36:34.952	2026-05-09 04:36:34.952
cmoxuqkpx0001i504j860ofpv	INSTITUCIONAIS (2)			institucional	/audios/track/69feb9d626ada_1778301398.mp3	0	0	t	2026-05-09 04:36:38.374	2026-05-09 04:36:38.374
cmoxuqqlq0002i504v641h7hu	INSTITUCIONAIS (3)			institucional	/audios/track/69feb9ddb316b_1778301405.mp3	0	0	t	2026-05-09 04:36:45.998	2026-05-09 04:36:45.998
cmoxur1pg0003i5048n408ac8	INSTITUCIONAIS (4)			institucional	/audios/track/69feb9ec09340_1778301420.mp3	0	0	t	2026-05-09 04:37:00.276	2026-05-09 04:37:00.276
cmpsdbug8000b8usxzzmaj40j	[000002]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1b1188dc_1780146609.mp3	0	0	t	2026-05-30 13:10:09.128	2026-05-30 13:10:09.128
cmoxur5h10004i5049g49wk6o	INSTITUCIONAIS (5)			institucional	/audios/track/69feb9f105d32_1778301425.mp3	0	0	t	2026-05-09 04:37:05.269	2026-05-09 04:37:05.269
cmoxurk330006i504xdqhrtxz	INSTITUCIONAIS (7)			institucional	/audios/track/69feba03d43da_1778301443.mp3	0	0	t	2026-05-09 04:37:24.095	2026-05-09 04:37:24.095
cmoxurwl10007i5044wg74huw	INSTITUCIONAIS (8)			institucional	/audios/track/69feba140e6f1_1778301460.mp3	0	0	t	2026-05-09 04:37:40.294	2026-05-09 04:37:40.294
cmoxus8rh0008i5049101lj67	INSTITUCIONAIS (9)			institucional	/audios/track/69feba23cf3df_1778301475.mp3	0	0	t	2026-05-09 04:37:56.076	2026-05-09 04:37:56.076
cmoxushut0009i504a1ok7314	INSTITUCIONAIS (10)			institucional	/audios/track/69feba2fb7e97_1778301487.mp3	0	0	t	2026-05-09 04:38:07.973	2026-05-09 04:38:07.973
cmoxustuo000ai5047mnqulf9	INSTITUCIONAIS (11)			institucional	/audios/track/69feba3f2c72d_1778301503.mp3	0	0	t	2026-05-09 04:38:23.408	2026-05-09 04:38:23.408
cmoxusxsa000bi504hrdm56y7	INSTITUCIONAIS (12)			institucional	/audios/track/69feba445e4a4_1778301508.mp3	0	0	t	2026-05-09 04:38:28.619	2026-05-09 04:38:28.619
cmoxut1pa000ci504fp73inor	INSTITUCIONAIS (13)			institucional	/audios/track/69feba496ee8f_1778301513.mp3	0	0	t	2026-05-09 04:38:33.694	2026-05-09 04:38:33.694
cmoxutesc000di50434ush1m5	INSTITUCIONAIS (14)			institucional	/audios/track/69feba5a4c1ad_1778301530.mp3	0	0	t	2026-05-09 04:38:50.54	2026-05-09 04:38:50.54
cmoxutoa6000ei50485yxujuf	INSTITUCIONAIS (15)			institucional	/audios/track/69feba66b21a5_1778301542.mp3	0	0	t	2026-05-09 04:39:02.959	2026-05-09 04:39:02.959
cmoxuu0ff000fi504fw3uj7th	INSTITUCIONAIS (16)			institucional	/audios/track/69feba7655cbc_1778301558.mp3	0	0	t	2026-05-09 04:39:18.587	2026-05-09 04:39:18.587
cmoxuub5u000gi504zickk6uf	INSTITUCIONAIS (17)			institucional	/audios/track/69feba8456928_1778301572.mp3	0	0	t	2026-05-09 04:39:32.61	2026-05-09 04:39:32.61
cmoxuumwh000hi504du9687zt	INSTITUCIONAIS (18)			institucional	/audios/track/69feba93787de_1778301587.mp3	0	0	t	2026-05-09 04:39:47.713	2026-05-09 04:39:47.713
cmoxuuyms000ii504gl1zh8cu	INSTITUCIONAIS (19)			institucional	/audios/track/69febaa219fe2_1778301602.mp3	0	0	t	2026-05-09 04:40:02.327	2026-05-09 04:40:02.327
cmoxuv231000ji504c6jsd7ui	INSTITUCIONAIS (20)			institucional	/audios/track/69febaa745712_1778301607.mp3	0	0	t	2026-05-09 04:40:07.502	2026-05-09 04:40:07.502
cmoxuvebr000ki504tmp9vsp6	INSTITUCIONAIS (21)			institucional	/audios/track/69febab707fae_1778301623.mp3	0	0	t	2026-05-09 04:40:23.253	2026-05-09 04:40:23.253
cmoxuvq93000li504prpk20fq	INSTITUCIONAIS (22)			institucional	/audios/track/69febac676920_1778301638.mp3	0	0	t	2026-05-09 04:40:38.71	2026-05-09 04:40:38.71
cmoxuw212000mi5043go502xy	INSTITUCIONAIS (23)			institucional	/audios/track/69febad5b5c95_1778301653.mp3	0	0	t	2026-05-09 04:40:53.973	2026-05-09 04:40:53.973
cmoxuwh0y000ni504ckxmie7z	INSTITUCIONAIS (24)			institucional	/audios/track/69febae92defe_1778301673.mp3	0	0	t	2026-05-09 04:41:13.409	2026-05-09 04:41:13.409
cmoxux22s000oi5040pp7jmry	INSTITUCIONAIS (25)			institucional	/audios/track/69febb0471c94_1778301700.mp3	0	0	t	2026-05-09 04:41:40.69	2026-05-09 04:41:40.69
cmoxuxdbu000pi5042j8lfjv0	INSTITUCIONAIS (26)			institucional	/audios/track/69febb1324904_1778301715.mp3	0	0	t	2026-05-09 04:41:55.386	2026-05-09 04:41:55.386
cmoxuxp2c000qi504vuyinuax	INSTITUCIONAIS (27)			institucional	/audios/track/69febb223e689_1778301730.mp3	0	0	t	2026-05-09 04:42:10.481	2026-05-09 04:42:10.481
cmoxuy13t000ri504mykp9skv	INSTITUCIONAIS (28)			institucional	/audios/track/69febb31cedb6_1778301745.mp3	0	0	t	2026-05-09 04:42:26.087	2026-05-09 04:42:26.087
cmoxuychd000si5048x2kgedv	INSTITUCIONAIS (29)			institucional	/audios/track/69febb40b23cd_1778301760.mp3	0	0	t	2026-05-09 04:42:40.945	2026-05-09 04:42:40.945
cmoxuyo33000ti5042cer7iov	INSTITUCIONAIS (30)			institucional	/audios/track/69febb4f9bb04_1778301775.mp3	0	0	t	2026-05-09 04:42:55.87	2026-05-09 04:42:55.87
cmoxuz02v000ui504wartd8qi	INSTITUCIONAIS (31)			institucional	/audios/track/69febb5f2a4c7_1778301791.mp3	0	0	t	2026-05-09 04:43:11.408	2026-05-09 04:43:11.408
cmoxuzdyg0000ju043q6ma2ue	INSTITUCIONAIS (32)			institucional	/audios/track/69febb7001c0a_1778301808.mp3	0	0	t	2026-05-09 04:43:29.508	2026-05-09 04:43:29.508
cmoxuzlaw0001ju04r4y3sfma	INSTITUCIONAIS (33)			institucional	/audios/track/69febb7abce94_1778301818.mp3	0	0	t	2026-05-09 04:43:39.032	2026-05-09 04:43:39.032
cmoxuzvzi0000jj045rzzs6qn	INSTITUCIONAIS (34)			institucional	/audios/track/69febb889d076_1778301832.mp3	0	0	t	2026-05-09 04:43:52.878	2026-05-09 04:43:52.878
cmoxuzzjd0001jj04y769kug5	INSTITUCIONAIS (35)			institucional	/audios/track/69febb8d3d59b_1778301837.mp3	0	0	t	2026-05-09 04:43:57.482	2026-05-09 04:43:57.482
cmoxv03j40002jj04hamfjtlk	INSTITUCIONAIS (36)			institucional	/audios/track/69febb9264f08_1778301842.mp3	0	0	t	2026-05-09 04:44:02.657	2026-05-09 04:44:02.657
cmoxv0dun0003jj04hpvbhdjr	INSTITUCIONAIS (37)			institucional	/audios/track/69febb9fa7dbb_1778301855.mp3	0	0	t	2026-05-09 04:44:15.916	2026-05-09 04:44:15.916
cmoxv0nz30004jj04lkr4b56z	INSTITUCIONAIS (38)			institucional	/audios/track/69febbacdf6ff_1778301868.mp3	0	0	t	2026-05-09 04:44:29.151	2026-05-09 04:44:29.151
cmoxv0x810005jj047shii2v9	INSTITUCIONAIS (39)			institucional	/audios/track/69febbb8c16bd_1778301880.mp3	0	0	t	2026-05-09 04:44:41.022	2026-05-09 04:44:41.022
cmoxv6l5e0001l604ha5kd7zz	TECNOLOGIA (2)			TECNOLOGIA	/audios/track/69febcc12d149_1778302145.mp3	0	0	t	2026-05-09 04:49:05.427	2026-05-09 04:49:05.427
cmoxv6o1p0002l604a9493wbz	TECNOLOGIA (3)			TECNOLOGIA	/audios/track/69febcc4eb326_1778302148.mp3	0	0	t	2026-05-09 04:49:09.182	2026-05-09 04:49:09.182
cmoxv6qgc0003l604em0i09oy	TECNOLOGIA (4)			TECNOLOGIA	/audios/track/69febcc7ec6f0_1778302151.mp3	0	0	t	2026-05-09 04:49:12.188	2026-05-09 04:49:12.188
cmoxv6svo0004l604w96d12kk	TECNOLOGIA (5)			TECNOLOGIA	/audios/track/69febccb36721_1778302155.mp3	0	0	t	2026-05-09 04:49:15.445	2026-05-09 04:49:15.445
cmoxv6z3o0005l604ykx7bp0p	TECNOLOGIA (6)			TECNOLOGIA	/audios/track/69febcd344ec6_1778302163.mp3	0	0	t	2026-05-09 04:49:23.508	2026-05-09 04:49:23.508
cmoxv75hq0006l60499n6dgko	TECNOLOGIA (7)			TECNOLOGIA	/audios/track/69febcdb6d34e_1778302171.mp3	0	0	t	2026-05-09 04:49:31.677	2026-05-09 04:49:31.677
cmoxv7beb0007l604u4cl82ge	TECNOLOGIA (8)			TECNOLOGIA	/audios/track/69febce334b31_1778302179.mp3	0	0	t	2026-05-09 04:49:39.443	2026-05-09 04:49:39.443
cmoxv9wc10000jv04c74dj7we	TRILHAS CURTAS (1)			VINHETAS	/audios/track/69febd5b8043c_1778302299.mp3	0	0	t	2026-05-09 04:51:39.773	2026-05-09 04:51:39.773
cmoxv9yc30001jv04usvb9eke	TRILHAS CURTAS (2)			VINHETAS	/audios/track/69febd5e3cac5_1778302302.mp3	0	0	t	2026-05-09 04:51:42.484	2026-05-09 04:51:42.484
cmoxva08a0002jv04bh263ok3	TRILHAS CURTAS (3)			VINHETAS	/audios/track/69febd60ad614_1778302304.mp3	0	0	t	2026-05-09 04:51:44.938	2026-05-09 04:51:44.938
cmoxva20g0003jv042kj84mia	TRILHAS CURTAS (4)			VINHETAS	/audios/track/69febd6306010_1778302307.mp3	0	0	t	2026-05-09 04:51:47.249	2026-05-09 04:51:47.249
cmoxva3w70004jv04snpqqh80	TRILHAS CURTAS (5)			VINHETAS	/audios/track/69febd65704df_1778302309.mp3	0	0	t	2026-05-09 04:51:49.688	2026-05-09 04:51:49.688
cmoxva5q80005jv043qpb7bf9	TRILHAS CURTAS (6)			VINHETAS	/audios/track/69febd67cd69d_1778302311.mp3	0	0	t	2026-05-09 04:51:52.065	2026-05-09 04:51:52.065
cmoxva7o60006jv04eklc6m31	TRILHAS CURTAS (7)			VINHETAS	/audios/track/69febd6a57777_1778302314.mp3	0	0	t	2026-05-09 04:51:54.583	2026-05-09 04:51:54.583
cmoxva9on0007jv04xpvho4bc	TRILHAS CURTAS (8)			VINHETAS	/audios/track/69febd6cce169_1778302316.mp3	0	0	t	2026-05-09 04:51:57.075	2026-05-09 04:51:57.075
cmoxvabmp0008jv044ytcze68	TRILHAS CURTAS (9)			VINHETAS	/audios/track/69febd6f78a23_1778302319.mp3	0	0	t	2026-05-09 04:51:59.714	2026-05-09 04:51:59.714
cmoxvadsj0009jv045qmdzp1z	TRILHAS CURTAS (10)			VINHETAS	/audios/track/69febd7247c51_1778302322.mp3	0	0	t	2026-05-09 04:52:02.515	2026-05-09 04:52:02.515
cmoxvag43000ajv04f66du85r	TRILHAS CURTAS (11)			VINHETAS	/audios/track/69febd75447bf_1778302325.mp3	0	0	t	2026-05-09 04:52:05.524	2026-05-09 04:52:05.524
cmoxvaiap000bjv04sdl7w7x2	TRILHAS CURTAS (12)			VINHETAS	/audios/track/69febd781cc3a_1778302328.mp3	0	0	t	2026-05-09 04:52:08.353	2026-05-09 04:52:08.353
cmoxvakqu000cjv04rne0f8xo	TRILHAS CURTAS (13)			VINHETAS	/audios/track/69febd7b48e92_1778302331.mp3	0	0	t	2026-05-09 04:52:11.526	2026-05-09 04:52:11.526
cmoxvan84000djv040q5zhxhe	TRILHAS CURTAS (14)			VINHETAS	/audios/track/69febd7e62067_1778302334.mp3	0	0	t	2026-05-09 04:52:14.625	2026-05-09 04:52:14.625
cmoxvapfe000ejv04dlxykbha	TRILHAS CURTAS (15)			VINHETAS	/audios/track/69febd815af67_1778302337.mp3	0	0	t	2026-05-09 04:52:17.594	2026-05-09 04:52:17.594
cmoxvas19000fjv04hpayrz5z	TRILHAS CURTAS (16)			VINHETAS	/audios/track/69febd84b7216_1778302340.mp3	0	0	t	2026-05-09 04:52:20.973	2026-05-09 04:52:20.973
cmoxvatyy000gjv049s9e8z6u	TRILHAS CURTAS (17)			VINHETAS	/audios/track/69febd873eeb8_1778302343.mp3	0	0	t	2026-05-09 04:52:23.483	2026-05-09 04:52:23.483
cmoxvawae000hjv044xofhs7w	TRILHAS CURTAS (18)			VINHETAS	/audios/track/69febd8a3f7b3_1778302346.mp3	0	0	t	2026-05-09 04:52:26.486	2026-05-09 04:52:26.486
cmoxvayq7000ijv044kjplwp2	TRILHAS CURTAS (19)			VINHETAS	/audios/track/69febd8d677c0_1778302349.mp3	0	0	t	2026-05-09 04:52:29.647	2026-05-09 04:52:29.647
cmoxulpdz0005jy04iju537vu	NEWS (6)			NEWS	/audios/track/69feb8f2e1152_1778301170.mp3	0	0	t	2026-05-09 04:32:51.143	2026-05-09 04:32:51.143
cmoxvb0t2000jjv04xa6rdsq9	TRILHAS CURTAS (20)			VINHETAS	/audios/track/69febd9000770_1778302352.mp3	0	0	t	2026-05-09 04:52:32.226	2026-05-09 04:52:32.226
cmoxvb32d000kjv04wklxjkh6	TRILHAS CURTAS (21)			VINHETAS	/audios/track/69febd930ad8e_1778302355.mp3	0	0	t	2026-05-09 04:52:35.27	2026-05-09 04:52:35.27
cmoxvb5kh000ljv04vew3hf8s	TRILHAS CURTAS (22)			VINHETAS	/audios/track/69febd9648371_1778302358.mp3	0	0	t	2026-05-09 04:52:38.513	2026-05-09 04:52:38.513
cmoxvb7rg000mjv04us4ssj0i	TRILHAS CURTAS (23)			VINHETAS	/audios/track/69febd992062c_1778302361.mp3	0	0	t	2026-05-09 04:52:41.357	2026-05-09 04:52:41.357
cmoxvba6x000njv04jimfnnnk	TRILHAS CURTAS (24)			VINHETAS	/audios/track/69febd9c4586d_1778302364.mp3	0	0	t	2026-05-09 04:52:44.505	2026-05-09 04:52:44.505
cmoxvbdrg000ojv04cby2n2g6	TRILHAS CURTAS (25)			VINHETAS	/audios/track/69febda0c057f_1778302368.mp3	0	0	t	2026-05-09 04:52:49.017	2026-05-09 04:52:49.017
cmoxvbfuo000pjv045x916oxt	TRILHAS CURTAS (26)			VINHETAS	/audios/track/69febda3953d5_1778302371.mp3	0	0	t	2026-05-09 04:52:51.84	2026-05-09 04:52:51.84
cmoxvbi0a000qjv04aft7uw34	TRILHAS CURTAS (27)			VINHETAS	/audios/track/69febda664d13_1778302374.mp3	0	0	t	2026-05-09 04:52:54.634	2026-05-09 04:52:54.634
cmoxvbk9p000rjv04u5xebshc	TRILHAS CURTAS (28)			VINHETAS	/audios/track/69febda94e4cc_1778302377.mp3	0	0	t	2026-05-09 04:52:57.566	2026-05-09 04:52:57.566
cmoxvbmrk000sjv04btenruxn	TRILHAS CURTAS (29)			VINHETAS	/audios/track/69febdac8cf76_1778302380.mp3	0	0	t	2026-05-09 04:53:00.8	2026-05-09 04:53:00.8
cmoxvbp3y000tjv04hcahsol5	TRILHAS CURTAS (30)			VINHETAS	/audios/track/69febdaf8a450_1778302383.mp3	0	0	t	2026-05-09 04:53:03.839	2026-05-09 04:53:03.839
cmoxvbrgj000ujv048sutogke	TRILHAS CURTAS (31)			VINHETAS	/audios/track/69febdb284d11_1778302386.mp3	0	0	t	2026-05-09 04:53:06.768	2026-05-09 04:53:06.768
cmoxvbtnz000vjv0467n7kl6v	TRILHAS CURTAS (32)			VINHETAS	/audios/track/69febdb57f08b_1778302389.mp3	0	0	t	2026-05-09 04:53:09.743	2026-05-09 04:53:09.743
cmoxvbvsm000wjv04o7tg0bns	TRILHAS CURTAS (33)			VINHETAS	/audios/track/69febdb844ec3_1778302392.mp3	0	0	t	2026-05-09 04:53:12.503	2026-05-09 04:53:12.503
cmoxvby8g000xjv042898fgul	TRILHAS CURTAS (34)			VINHETAS	/audios/track/69febdbb6bc35_1778302395.mp3	0	0	t	2026-05-09 04:53:15.665	2026-05-09 04:53:15.665
cmoxvc0nh000yjv04oz5bupjf	TRILHAS CURTAS (35)			VINHETAS	/audios/track/69febdbe8802e_1778302398.mp3	0	0	t	2026-05-09 04:53:18.797	2026-05-09 04:53:18.797
cmoxvc2u5000zjv04cy74r8kc	TRILHAS CURTAS (36)			VINHETAS	/audios/track/69febdc164266_1778302401.mp3	0	0	t	2026-05-09 04:53:21.629	2026-05-09 04:53:21.629
cmoxvc55k0010jv046uxgs4ra	TRILHAS CURTAS (37)			VINHETAS	/audios/track/69febdc4444e9_1778302404.mp3	0	0	t	2026-05-09 04:53:24.517	2026-05-09 04:53:24.517
cmoxvc7g80011jv04zogjikxu	TRILHAS CURTAS (38)			VINHETAS	/audios/track/69febdc75f32d_1778302407.mp3	0	0	t	2026-05-09 04:53:27.608	2026-05-09 04:53:27.608
cmoxvc9r10012jv04hl9gilom	TRILHAS CURTAS (39)			VINHETAS	/audios/track/69febdca59d73_1778302410.mp3	0	0	t	2026-05-09 04:53:30.59	2026-05-09 04:53:30.59
cmoxvcc0h0013jv047pnhxi0q	TRILHAS CURTAS (40)			VINHETAS	/audios/track/69febdcd47d81_1778302413.mp3	0	0	t	2026-05-09 04:53:33.522	2026-05-09 04:53:33.522
cmoxvceay0014jv045u3f166y	TRILHAS CURTAS (41)			VINHETAS	/audios/track/69febdd040ad6_1778302416.mp3	0	0	t	2026-05-09 04:53:36.491	2026-05-09 04:53:36.491
cmoxvcgnd0015jv04dzjd6kz0	TRILHAS CURTAS (42)			VINHETAS	/audios/track/69febdd34aca2_1778302419.mp3	0	0	t	2026-05-09 04:53:39.53	2026-05-09 04:53:39.53
cmoxvcj4u0016jv04l5159rss	TRILHAS CURTAS (43)			VINHETAS	/audios/track/69febdd664a2c_1778302422.mp3	0	0	t	2026-05-09 04:53:42.635	2026-05-09 04:53:42.635
cmoxvclbw0017jv0467wsjbmo	TRILHAS CURTAS (44)			VINHETAS	/audios/track/69febdd95cb27_1778302425.mp3	0	0	t	2026-05-09 04:53:45.597	2026-05-09 04:53:45.597
cmoxvcnot0018jv047svzjxi5	TRILHAS CURTAS (45)			VINHETAS	/audios/track/69febddc6819c_1778302428.mp3	0	0	t	2026-05-09 04:53:48.653	2026-05-09 04:53:48.653
cmoxvcq090019jv046m884465	TRILHAS CURTAS (46)			VINHETAS	/audios/track/69febddf69a6e_1778302431.mp3	0	0	t	2026-05-09 04:53:51.657	2026-05-09 04:53:51.657
cmoxvcsft001ajv04r5zy43ns	TRILHAS CURTAS (47)			VINHETAS	/audios/track/69febde28eed7_1778302434.mp3	0	0	t	2026-05-09 04:53:54.809	2026-05-09 04:53:54.809
cmoxvcumj001bjv04mdzj39ai	TRILHAS CURTAS (48)			VINHETAS	/audios/track/69febde567493_1778302437.mp3	0	0	t	2026-05-09 04:53:57.643	2026-05-09 04:53:57.643
cmoxvcx7k001cjv04i9yeuk4o	TRILHAS CURTAS (49)			VINHETAS	/audios/track/69febde89a610_1778302440.mp3	0	0	t	2026-05-09 04:54:00.877	2026-05-09 04:54:00.877
cmoxvczbx001djv044i5xjj47	TRILHAS CURTAS (50)			VINHETAS	/audios/track/69febdeb7ee89_1778302443.mp3	0	0	t	2026-05-09 04:54:03.742	2026-05-09 04:54:03.742
cmoxvd1k5001ejv04j411dfn3	TRILHAS CURTAS (51)			VINHETAS	/audios/track/69febdee616b4_1778302446.mp3	0	0	t	2026-05-09 04:54:06.63	2026-05-09 04:54:06.63
cmoxvd3w8001fjv0441vnm1h2	TRILHAS CURTAS (52)			VINHETAS	/audios/track/69febdf161fee_1778302449.mp3	0	0	t	2026-05-09 04:54:09.656	2026-05-09 04:54:09.656
cmoxvd6bc001gjv040nkoayl2	TRILHAS CURTAS (53)			VINHETAS	/audios/track/69febdf470c8a_1778302452.mp3	0	0	t	2026-05-09 04:54:12.793	2026-05-09 04:54:12.793
cmoxvd8ez001hjv04wcqwodjh	TRILHAS CURTAS (54)			VINHETAS	/audios/track/69febdf748b47_1778302455.mp3	0	0	t	2026-05-09 04:54:15.515	2026-05-09 04:54:15.515
cmoxvdaye001ijv04old4u5tj	TRILHAS CURTAS (55)			VINHETAS	/audios/track/69febdfa458e7_1778302458.mp3	0	0	t	2026-05-09 04:54:18.691	2026-05-09 04:54:18.691
cmoxvdd59001jjv04u46si3wc	TRILHAS CURTAS (56)			VINHETAS	/audios/track/69febdfd6757f_1778302461.mp3	0	0	t	2026-05-09 04:54:21.646	2026-05-09 04:54:21.646
cmoxvdfij001kjv043u83x59t	TRILHAS CURTAS (57)			VINHETAS	/audios/track/69febe0078eed_1778302464.mp3	0	0	t	2026-05-09 04:54:24.715	2026-05-09 04:54:24.715
cmoxvdhqr001ljv041bij2oze	TRILHAS CURTAS (58)			VINHETAS	/audios/track/69febe035ccb3_1778302467.mp3	0	0	t	2026-05-09 04:54:27.604	2026-05-09 04:54:27.604
cmoxvdk22001mjv04dzjs2jjr	TRILHAS CURTAS (59)			VINHETAS	/audios/track/69febe065d4fe_1778302470.mp3	0	0	t	2026-05-09 04:54:30.602	2026-05-09 04:54:30.602
cmoxvdmar001njv04dty9rsfb	TRILHAS CURTAS (60)			VINHETAS	/audios/track/69febe0942689_1778302473.mp3	0	0	t	2026-05-09 04:54:33.508	2026-05-09 04:54:33.508
cmoxvdoot001ojv04xhltyccc	TRILHAS CURTAS (61)			VINHETAS	/audios/track/69febe0c41dc3_1778302476.mp3	0	0	t	2026-05-09 04:54:36.49	2026-05-09 04:54:36.49
cmoxvdqwp001pjv04zahodthz	TRILHAS CURTAS (62)			VINHETAS	/audios/track/69febe0f3fdd0_1778302479.mp3	0	0	t	2026-05-09 04:54:39.481	2026-05-09 04:54:39.481
cmoxvdtut001qjv04fgrjvcxr	TRILHAS CURTAS (63)			VINHETAS	/audios/track/69febe125ab46_1778302482.mp3	0	0	t	2026-05-09 04:54:42.601	2026-05-09 04:54:42.601
cmoxvdwkj001rjv04onpkp9si	TRILHAS CURTAS (64)			VINHETAS	/audios/track/69febe1692a5c_1778302486.mp3	0	0	t	2026-05-09 04:54:46.82	2026-05-09 04:54:46.82
cmoxvdyli001sjv04x9dqcvep	TRILHAS CURTAS (65)			VINHETAS	/audios/track/69febe1938b68_1778302489.mp3	0	0	t	2026-05-09 04:54:49.447	2026-05-09 04:54:49.447
cmoxve0zi001tjv048m1ylfyz	TRILHAS CURTAS (66)			VINHETAS	/audios/track/69febe1c4fa01_1778302492.mp3	0	0	t	2026-05-09 04:54:52.542	2026-05-09 04:54:52.542
cmoxve37r001ujv04cio25jrf	TRILHAS CURTAS (67)			VINHETAS	/audios/track/69febe1f32ebf_1778302495.mp3	0	0	t	2026-05-09 04:54:55.432	2026-05-09 04:54:55.432
cmoxve5f8001vjv04s1w2b58x	TRILHAS CURTAS (68)			VINHETAS	/audios/track/69febe221351b_1778302498.mp3	0	0	t	2026-05-09 04:54:58.292	2026-05-09 04:54:58.292
cmoxve7u6001wjv045yamlus5	TRILHAS CURTAS (69)			VINHETAS	/audios/track/69febe2516a5d_1778302501.mp3	0	0	t	2026-05-09 04:55:01.309	2026-05-09 04:55:01.309
cmpsdbvk5000c8usx6zzt4jt8	[000003]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1b283bdd_1780146610.mp3	0	0	t	2026-05-30 13:10:10.566	2026-05-30 13:10:10.566
cmoxveaap001xjv04meru7xq3	TRILHAS CURTAS (70)			VINHETAS	/audios/track/69febe285d472_1778302504.mp3	0	0	t	2026-05-09 04:55:04.61	2026-05-09 04:55:04.61
cmoxvecke001yjv04b4bimtvr	TRILHAS CURTAS (71)			VINHETAS	/audios/track/69febe2b520a8_1778302507.mp3	0	0	t	2026-05-09 04:55:07.55	2026-05-09 04:55:07.55
cmoxveeso001zjv04irtl4pg7	TRILHAS CURTAS (72)			VINHETAS	/audios/track/69febe2e36f35_1778302510.mp3	0	0	t	2026-05-09 04:55:10.44	2026-05-09 04:55:10.44
cmoxvehso0020jv04329159fl	TRILHAS CURTAS (73)			VINHETAS	/audios/track/69febe321aee7_1778302514.mp3	0	0	t	2026-05-09 04:55:14.328	2026-05-09 04:55:14.328
cmoxvekji0021jv04h84bjvip	TRILHAS CURTAS (74)			VINHETAS	/audios/track/69febe3585ddc_1778302517.mp3	0	0	t	2026-05-09 04:55:17.773	2026-05-09 04:55:17.773
cmoxvemmd0022jv04mt8ieocr	TRILHAS CURTAS (75)			VINHETAS	/audios/track/69febe3857f9f_1778302520.mp3	0	0	t	2026-05-09 04:55:20.582	2026-05-09 04:55:20.582
cmoxveoxr0023jv04d3e01spd	TRILHAS CURTAS (76)			VINHETAS	/audios/track/69febe3b585d2_1778302523.mp3	0	0	t	2026-05-09 04:55:23.583	2026-05-09 04:55:23.583
cmoxver5v0024jv04oykueghi	TRILHAS CURTAS (77)			VINHETAS	/audios/track/69febe3e3c92c_1778302526.mp3	0	0	t	2026-05-09 04:55:26.468	2026-05-09 04:55:26.468
cmoxvetdj0025jv0473rljvm7	TRILHAS CURTAS (78)			VINHETAS	/audios/track/69febe411c1ca_1778302529.mp3	0	0	t	2026-05-09 04:55:29.336	2026-05-09 04:55:29.336
cmoxvevsb0026jv04igenqk87	TRILHAS CURTAS (79)			VINHETAS	/audios/track/69febe443a9b4_1778302532.mp3	0	0	t	2026-05-09 04:55:32.459	2026-05-09 04:55:32.459
cmoxvey6w0027jv04t1o925wd	TRILHAS CURTAS (80)			VINHETAS	/audios/track/69febe473ac43_1778302535.mp3	0	0	t	2026-05-09 04:55:35.463	2026-05-09 04:55:35.463
cmoxvf0in0028jv04gup1d3tk	TRILHAS CURTAS (81)			VINHETAS	/audios/track/69febe4a5ae74_1778302538.mp3	0	0	t	2026-05-09 04:55:38.592	2026-05-09 04:55:38.592
cmoxvf37n0029jv04b6p2wtuy	TRILHAS CURTAS (82)			VINHETAS	/audios/track/69febe4dd1f33_1778302541.mp3	0	0	t	2026-05-09 04:55:42.083	2026-05-09 04:55:42.083
cmoxvf5a7002ajv04owu748fx	TRILHAS CURTAS (83)			VINHETAS	/audios/track/69febe5083f5b_1778302544.mp3	0	0	t	2026-05-09 04:55:44.767	2026-05-09 04:55:44.767
cmoxvf7lj002bjv04n46acaoe	TRILHAS CURTAS (84)			VINHETAS	/audios/track/69febe53857bd_1778302547.mp3	0	0	t	2026-05-09 04:55:47.767	2026-05-09 04:55:47.767
cmoxvf9wj002cjv04h6vg3bho	TRILHAS CURTAS (85)			VINHETAS	/audios/track/69febe56629f6_1778302550.mp3	0	0	t	2026-05-09 04:55:50.642	2026-05-09 04:55:50.642
cmoxvfbzq002djv04ax0o5qcq	TRILHAS CURTAS (86)			VINHETAS	/audios/track/69febe593bb83_1778302553.mp3	0	0	t	2026-05-09 04:55:53.463	2026-05-09 04:55:53.463
cmoxvfeff002ejv04detc19uv	TRILHAS CURTAS (87)			VINHETAS	/audios/track/69febe5c60c9c_1778302556.mp3	0	0	t	2026-05-09 04:55:56.62	2026-05-09 04:55:56.62
cmoxvfgri002fjv04h9a9vetl	TRILHAS CURTAS (88)			VINHETAS	/audios/track/69febe5f6680e_1778302559.mp3	0	0	t	2026-05-09 04:55:59.647	2026-05-09 04:55:59.647
cmoxvfiu1002gjv04qh1pwkpe	TRILHAS CURTAS (89)			VINHETAS	/audios/track/69febe621985c_1778302562.mp3	0	0	t	2026-05-09 04:56:02.329	2026-05-09 04:56:02.329
cmoxvflcb002hjv04ebfoj7ti	TRILHAS CURTAS (90)			VINHETAS	/audios/track/69febe65578d1_1778302565.mp3	0	0	t	2026-05-09 04:56:05.579	2026-05-09 04:56:05.579
cmoxvfnqp002ijv04fzt4t4hm	TRILHAS CURTAS (91)			VINHETAS	/audios/track/69febe6857542_1778302568.mp3	0	0	t	2026-05-09 04:56:08.576	2026-05-09 04:56:08.576
cmoxvfpvk002jjv04f4c87cjz	TRILHAS CURTAS (92)			VINHETAS	/audios/track/69febe6b3986c_1778302571.mp3	0	0	t	2026-05-09 04:56:11.457	2026-05-09 04:56:11.457
cmoxvfsa8002kjv04ivz4x075	TRILHAS CURTAS (93)			VINHETAS	/audios/track/69febe6e57a48_1778302574.mp3	0	0	t	2026-05-09 04:56:14.577	2026-05-09 04:56:14.577
cmoxvfuni002ljv04d6iv0z75	TRILHAS CURTAS (94)			VINHETAS	/audios/track/69febe7167a61_1778302577.mp3	0	0	t	2026-05-09 04:56:17.646	2026-05-09 04:56:17.646
cmoxvfwvj002mjv049i55ex3t	TRILHAS CURTAS (95)			VINHETAS	/audios/track/69febe7445df2_1778302580.mp3	0	0	t	2026-05-09 04:56:20.527	2026-05-09 04:56:20.527
cmoxvfz14002njv046msawmbi	TRILHAS CURTAS (96)			VINHETAS	/audios/track/69febe7717e41_1778302583.mp3	0	0	t	2026-05-09 04:56:23.32	2026-05-09 04:56:23.32
cmoxvg1k4002ojv044xbced5j	TRILHAS CURTAS (97)			VINHETAS	/audios/track/69febe7a3fbde_1778302586.mp3	0	0	t	2026-05-09 04:56:26.483	2026-05-09 04:56:26.483
cmoxvg3rx002pjv04bj1holqz	TRILHAS CURTAS (98)			VINHETAS	/audios/track/69febe7d3b2b5_1778302589.mp3	0	0	t	2026-05-09 04:56:29.469	2026-05-09 04:56:29.469
cmoxvg684002qjv04a89yeeih	TRILHAS CURTAS (99)			VINHETAS	/audios/track/69febe8067042_1778302592.mp3	0	0	t	2026-05-09 04:56:32.645	2026-05-09 04:56:32.645
cmoxvg8ek002rjv04593lrrkf	TRILHAS CURTAS (100)			VINHETAS	/audios/track/69febe833ca5f_1778302595.mp3	0	0	t	2026-05-09 04:56:35.468	2026-05-09 04:56:35.468
cmoxvgata002sjv0441u0bf5v	TRILHAS CURTAS (101)			VINHETAS	/audios/track/69febe865aa98_1778302598.mp3	0	0	t	2026-05-09 04:56:38.59	2026-05-09 04:56:38.59
cmoxvgd16002tjv04hymkhh79	TRILHAS CURTAS (102)			VINHETAS	/audios/track/69febe893c9ff_1778302601.mp3	0	0	t	2026-05-09 04:56:41.467	2026-05-09 04:56:41.467
cmoxvgfcj002ujv046v2k3qoh	TRILHAS CURTAS (103)			VINHETAS	/audios/track/69febe8c2068a_1778302604.mp3	0	0	t	2026-05-09 04:56:44.354	2026-05-09 04:56:44.354
cmoxvghoc002vjv04j807zp9k	TRILHAS CURTAS (104)			VINHETAS	/audios/track/69febe8f3e36d_1778302607.mp3	0	0	t	2026-05-09 04:56:47.484	2026-05-09 04:56:47.484
cmoxvgjzv002wjv04cxe2as4q	TRILHAS CURTAS (105)			VINHETAS	/audios/track/69febe923ebe7_1778302610.mp3	0	0	t	2026-05-09 04:56:50.492	2026-05-09 04:56:50.492
cmoxvgmdi002xjv04i9uefnly	TRILHAS CURTAS (106)			VINHETAS	/audios/track/69febe9556749_1778302613.mp3	0	0	t	2026-05-09 04:56:53.574	2026-05-09 04:56:53.574
cmoxvgols002yjv04t9b5oxzu	TRILHAS CURTAS (107)			VINHETAS	/audios/track/69febe983b570_1778302616.mp3	0	0	t	2026-05-09 04:56:56.464	2026-05-09 04:56:56.464
cmoxvgr3w002zjv04407wci3n	TRILHAS CURTAS (108)			VINHETAS	/audios/track/69febe9b594e6_1778302619.mp3	0	0	t	2026-05-09 04:56:59.594	2026-05-09 04:56:59.594
cmoxvgtbv0030jv041b39yd2p	TRILHAS CURTAS (109)			VINHETAS	/audios/track/69febe9e5a268_1778302622.mp3	0	0	t	2026-05-09 04:57:02.588	2026-05-09 04:57:02.588
cmoxvgvnx0031jv04h6eor9ud	TRILHAS CURTAS (110)			VINHETAS	/audios/track/69febea15fab6_1778302625.mp3	0	0	t	2026-05-09 04:57:05.613	2026-05-09 04:57:05.613
cmoxvgxzj0032jv04zq64n4ex	TRILHAS CURTAS (111)			VINHETAS	/audios/track/69febea460183_1778302628.mp3	0	0	t	2026-05-09 04:57:08.623	2026-05-09 04:57:08.623
cmoxvh06s0033jv045jrjad6y	TRILHAS CURTAS (112)			VINHETAS	/audios/track/69febea73e563_1778302631.mp3	0	0	t	2026-05-09 04:57:11.477	2026-05-09 04:57:11.477
cmoxvh2hk0034jv04yucu1fij	TRILHAS CURTAS (113)			VINHETAS	/audios/track/69febeaa3956e_1778302634.mp3	0	0	t	2026-05-09 04:57:14.456	2026-05-09 04:57:14.456
cmoxvh4zh0035jv044yqaehvs	TRILHAS CURTAS (114)			VINHETAS	/audios/track/69febead57219_1778302637.mp3	0	0	t	2026-05-09 04:57:17.58	2026-05-09 04:57:17.58
cmoxvh7bh0036jv04k0xau91j	TRILHAS CURTAS (115)			VINHETAS	/audios/track/69febeb078c9b_1778302640.mp3	0	0	t	2026-05-09 04:57:20.718	2026-05-09 04:57:20.718
cmoxvh9j30037jv049aeigpti	TRILHAS CURTAS (116)			VINHETAS	/audios/track/69febeb357eb3_1778302643.mp3	0	0	t	2026-05-09 04:57:23.584	2026-05-09 04:57:23.584
cmoxvhbx20038jv04fmr3gt36	TRILHAS CURTAS (117)			VINHETAS	/audios/track/69febeb66d160_1778302646.mp3	0	0	t	2026-05-09 04:57:26.678	2026-05-09 04:57:26.678
cmoxvhed80039jv0451rsor8g	TRILHAS CURTAS (118)			VINHETAS	/audios/track/69febeb99a6a9_1778302649.mp3	0	0	t	2026-05-09 04:57:29.853	2026-05-09 04:57:29.853
cmoxvhggw003ajv040u99fngr	TRILHAS CURTAS (119)			VINHETAS	/audios/track/69febebc56fcf_1778302652.mp3	0	0	t	2026-05-09 04:57:32.576	2026-05-09 04:57:32.576
cmoxvhix5003bjv04kj2gl0yi	TRILHAS CURTAS (120)			VINHETAS	/audios/track/69febebf6505b_1778302655.mp3	0	0	t	2026-05-09 04:57:35.64	2026-05-09 04:57:35.64
cmoxvhl3x003cjv042ds8fusn	TRILHAS CURTAS (121)			VINHETAS	/audios/track/69febec259f0f_1778302658.mp3	0	0	t	2026-05-09 04:57:38.589	2026-05-09 04:57:38.589
cmoxvhnc8003djv0469g67qb5	TRILHAS CURTAS (122)			VINHETAS	/audios/track/69febec53f133_1778302661.mp3	0	0	t	2026-05-09 04:57:41.48	2026-05-09 04:57:41.48
cmoxvhpsm003ejv04tt36my5f	TRILHAS CURTAS (123)			VINHETAS	/audios/track/69febec86b575_1778302664.mp3	0	0	t	2026-05-09 04:57:44.663	2026-05-09 04:57:44.663
cmoxvhs7d003fjv040ry5je3v	TRILHAS CURTAS (124)			VINHETAS	/audios/track/69febecb89ecb_1778302667.mp3	0	0	t	2026-05-09 04:57:47.786	2026-05-09 04:57:47.786
cmoxvhu9y003gjv049390gyvw	TRILHAS CURTAS (125)			VINHETAS	/audios/track/69febece3b697_1778302670.mp3	0	0	t	2026-05-09 04:57:50.47	2026-05-09 04:57:50.47
cmoxvhwr9003hjv04pr95naqo	TRILHAS CURTAS (126)			VINHETAS	/audios/track/69febed15594d_1778302673.mp3	0	0	t	2026-05-09 04:57:53.572	2026-05-09 04:57:53.572
cmoxvhz59003ijv04mtvs4udn	TRILHAS CURTAS (127)			VINHETAS	/audios/track/69febed489ca4_1778302676.mp3	0	0	t	2026-05-09 04:57:56.781	2026-05-09 04:57:56.781
cmoxvi1ky003jjv043iev4wv3	TRILHAS CURTAS (128)			VINHETAS	/audios/track/69febed7953a2_1778302679.mp3	0	0	t	2026-05-09 04:57:59.938	2026-05-09 04:57:59.938
cmoxvi3u8003kjv04cv5mwmo5	TRILHAS CURTAS (129)			VINHETAS	/audios/track/69febeda9dab5_1778302682.mp3	0	0	t	2026-05-09 04:58:02.865	2026-05-09 04:58:02.865
cmoxvi5zz003ljv048ammvl67	TRILHAS CURTAS (130)			VINHETAS	/audios/track/69febedd5a53b_1778302685.mp3	0	0	t	2026-05-09 04:58:05.663	2026-05-09 04:58:05.663
cmoxvi8b6003mjv04f8aggpzh	TRILHAS CURTAS (131)			VINHETAS	/audios/track/69febee05de86_1778302688.mp3	0	0	t	2026-05-09 04:58:08.658	2026-05-09 04:58:08.658
cmoxviakx003njv046o4f18ds	TRILHAS CURTAS (132)			VINHETAS	/audios/track/69febee33f241_1778302691.mp3	0	0	t	2026-05-09 04:58:11.487	2026-05-09 04:58:11.487
cmoxvid53003ojv046wucrzwj	TRILHAS CURTAS (133)			VINHETAS	/audios/track/69febee6a6a3e_1778302694.mp3	0	0	t	2026-05-09 04:58:14.919	2026-05-09 04:58:14.919
cmoxvifb3003pjv043c1t95wx	TRILHAS CURTAS (134)			VINHETAS	/audios/track/69febee97cfd2_1778302697.mp3	0	0	t	2026-05-09 04:58:17.728	2026-05-09 04:58:17.728
cmoxvihll003qjv04qryyy9q9	TRILHAS CURTAS (135)			VINHETAS	/audios/track/69febeec72378_1778302700.mp3	0	0	t	2026-05-09 04:58:20.698	2026-05-09 04:58:20.698
cmoxvik2k003rjv04q8ycrv1v	TRILHAS CURTAS (136)			VINHETAS	/audios/track/69febeefa5dc5_1778302703.mp3	0	0	t	2026-05-09 04:58:23.9	2026-05-09 04:58:23.9
cmoxvim5k003sjv04mdzvpvfh	TRILHAS CURTAS (137)			VINHETAS	/audios/track/69febef25c72b_1778302706.mp3	0	0	t	2026-05-09 04:58:26.601	2026-05-09 04:58:26.601
cmoxvioqw003tjv04fx6oxe1l	TRILHAS CURTAS (138)			VINHETAS	/audios/track/69febef598639_1778302709.mp3	0	0	t	2026-05-09 04:58:29.846	2026-05-09 04:58:29.846
cmoxviqs9003ujv04g2kave7u	TRILHAS CURTAS (139)			VINHETAS	/audios/track/69febef85bd01_1778302712.mp3	0	0	t	2026-05-09 04:58:32.601	2026-05-09 04:58:32.601
cmoxvit3g003vjv04qt9o07bk	TRILHAS CURTAS (140)			VINHETAS	/audios/track/69febefb5be1f_1778302715.mp3	0	0	t	2026-05-09 04:58:35.597	2026-05-09 04:58:35.597
cmoxvivhs003wjv045hc901pe	TRILHAS CURTAS (141)			VINHETAS	/audios/track/69febefe762f8_1778302718.mp3	0	0	t	2026-05-09 04:58:38.704	2026-05-09 04:58:38.704
cmoxviy3a003xjv046wsva5jf	TRILHAS CURTAS (142)			VINHETAS	/audios/track/69febf01cee0c_1778302721.mp3	0	0	t	2026-05-09 04:58:42.071	2026-05-09 04:58:42.071
cmoxvj074003yjv04uvmdfedd	TRILHAS CURTAS (143)			VINHETAS	/audios/track/69febf048db46_1778302724.mp3	0	0	t	2026-05-09 04:58:44.8	2026-05-09 04:58:44.8
cmoxvj2k5003zjv04bww8ifgn	TRILHAS CURTAS (144)			VINHETAS	/audios/track/69febf077fd47_1778302727.mp3	0	0	t	2026-05-09 04:58:47.747	2026-05-09 04:58:47.747
cmoxvj4w70040jv04o7tjl0d0	TRILHAS CURTAS (145)			VINHETAS	/audios/track/69febf0aa2d03_1778302730.mp3	0	0	t	2026-05-09 04:58:50.887	2026-05-09 04:58:50.887
cmoxvj73l0041jv04owsmwia2	TRILHAS CURTAS (146)			VINHETAS	/audios/track/69febf0d807bf_1778302733.mp3	0	0	t	2026-05-09 04:58:53.745	2026-05-09 04:58:53.745
cmoxvj9jk0042jv045s3p0zzx	TRILHAS CURTAS (147)			VINHETAS	/audios/track/69febf10a956c_1778302736.mp3	0	0	t	2026-05-09 04:58:56.913	2026-05-09 04:58:56.913
cmoxvjblm0043jv04d8l225hh	TRILHAS CURTAS (148)			VINHETAS	/audios/track/69febf1356743_1778302739.mp3	0	0	t	2026-05-09 04:58:59.579	2026-05-09 04:58:59.579
cmoxvjeeg0044jv04837jecd4	TRILHAS CURTAS (149)			VINHETAS	/audios/track/69febf16d2487_1778302742.mp3	0	0	t	2026-05-09 04:59:03.094	2026-05-09 04:59:03.094
cmoxvjgze0045jv04gzd0uyga	TRILHAS CURTAS (150)			VINHETAS	/audios/track/69febf1a50a12_1778302746.mp3	0	0	t	2026-05-09 04:59:06.555	2026-05-09 04:59:06.555
cmoxvjj8a0046jv0441qnjika	TRILHAS CURTAS (151)			VINHETAS	/audios/track/69febf1d3baf2_1778302749.mp3	0	0	t	2026-05-09 04:59:09.467	2026-05-09 04:59:09.467
cmoxvjljr0047jv04ckcpnpty	TRILHAS CURTAS (152)			VINHETAS	/audios/track/69febf203bd5e_1778302752.mp3	0	0	t	2026-05-09 04:59:12.472	2026-05-09 04:59:12.472
cmoxvjnxs0048jv04ymzu51ku	TRILHAS CURTAS (153)			VINHETAS	/audios/track/69febf2354f60_1778302755.mp3	0	0	t	2026-05-09 04:59:15.568	2026-05-09 04:59:15.568
cmoxvjq9g0049jv04e7bhp94n	TRILHAS CURTAS (154)			VINHETAS	/audios/track/69febf263c5f5_1778302758.mp3	0	0	t	2026-05-09 04:59:18.466	2026-05-09 04:59:18.466
cmoxvjsh2004ajv04qa133z00	TRILHAS CURTAS (155)			VINHETAS	/audios/track/69febf29359bd_1778302761.mp3	0	0	t	2026-05-09 04:59:21.446	2026-05-09 04:59:21.446
cmoxvjuvj004bjv04a9ofgw33	TRILHAS CURTAS (156)			VINHETAS	/audios/track/69febf2c4f45f_1778302764.mp3	0	0	t	2026-05-09 04:59:24.559	2026-05-09 04:59:24.559
cmoxvjxgb004cjv04tqdpb5bv	TRILHAS CURTAS (157)			VINHETAS	/audios/track/69febf2fa61cd_1778302767.mp3	0	0	t	2026-05-09 04:59:27.899	2026-05-09 04:59:27.899
cmoxvjzbo004djv04pcmlwnid	TRILHAS CURTAS (158)			VINHETAS	/audios/track/69febf321933e_1778302770.mp3	0	0	t	2026-05-09 04:59:30.325	2026-05-09 04:59:30.325
cmoxvk200004ejv04kaagacxq	TRILHAS CURTAS (159)			VINHETAS	/audios/track/69febf356f641_1778302773.mp3	0	0	t	2026-05-09 04:59:33.679	2026-05-09 04:59:33.679
cmoxvk44g004fjv04m7uq8jdw	TRILHAS CURTAS (160)			VINHETAS	/audios/track/69febf384f86b_1778302776.mp3	0	0	t	2026-05-09 04:59:36.545	2026-05-09 04:59:36.545
cmoxvk69j004gjv04oi5loxjh	TRILHAS CURTAS (161)			VINHETAS	/audios/track/69febf3b1800d_1778302779.mp3	0	0	t	2026-05-09 04:59:39.319	2026-05-09 04:59:39.319
cmoxvk8kn004hjv04u412rv9u	TRILHAS CURTAS (162)			VINHETAS	/audios/track/69febf3e14d1c_1778302782.mp3	0	0	t	2026-05-09 04:59:42.311	2026-05-09 04:59:42.311
cmoxvkbj5004ijv047mk4p0da	TRILHAS CURTAS (163)			VINHETAS	/audios/track/69febf413591b_1778302785.mp3	0	0	t	2026-05-09 04:59:45.44	2026-05-09 04:59:45.44
cmoxvkefc004jjv040x7c69aa	TRILHAS CURTAS (164)			VINHETAS	/audios/track/69febf45a648c_1778302789.mp3	0	0	t	2026-05-09 04:59:49.896	2026-05-09 04:59:49.896
cmoxvkgea004kjv040hz9ljni	TRILHAS CURTAS (165)			VINHETAS	/audios/track/69febf4839deb_1778302792.mp3	0	0	t	2026-05-09 04:59:52.451	2026-05-09 04:59:52.451
cmoxvkiom004ljv04ygf3odr7	TRILHAS CURTAS (166)			VINHETAS	/audios/track/69febf4b31352_1778302795.mp3	0	0	t	2026-05-09 04:59:55.414	2026-05-09 04:59:55.414
cmoxvklby004mjv04yx31vyc6	TRILHAS CURTAS (167)			VINHETAS	/audios/track/69febf4e98a6c_1778302798.mp3	0	0	t	2026-05-09 04:59:58.847	2026-05-09 04:59:58.847
cmoxvknjp004njv042w9hwxs0	TRILHAS CURTAS (168)			VINHETAS	/audios/track/69febf5154c94_1778302801.mp3	0	0	t	2026-05-09 05:00:01.604	2026-05-09 05:00:01.604
cmoxvkpci004ojv04hl6qx5h2	TRILHAS CURTAS (169)			VINHETAS	/audios/track/69febf53ca392_1778302803.mp3	0	0	t	2026-05-09 05:00:04.05	2026-05-09 05:00:04.05
cmoxvkqyv004pjv04f0li9l2h	TRILHAS CURTAS (170)			VINHETAS	/audios/track/69febf55e2c5f_1778302805.mp3	0	0	t	2026-05-09 05:00:06.151	2026-05-09 05:00:06.151
cmoxvksf1004qjv04o8yquqn8	TRILHAS CURTAS (171)			VINHETAS	/audios/track/69febf57c5d45_1778302807.mp3	0	0	t	2026-05-09 05:00:08.03	2026-05-09 05:00:08.03
cmoxvktys004rjv04eng5hxsp	TRILHAS CURTAS (172)			VINHETAS	/audios/track/69febf59c6a16_1778302809.mp3	0	0	t	2026-05-09 05:00:10.037	2026-05-09 05:00:10.037
cmoxvkvll004sjv04wswngjtj	TRILHAS CURTAS (173)			VINHETAS	/audios/track/69febf5be419a_1778302811.mp3	0	0	t	2026-05-09 05:00:12.153	2026-05-09 05:00:12.153
cmoxvkx8n004tjv047i6e3x3z	TRILHAS CURTAS (174)			VINHETAS	/audios/track/69febf5e0ed75_1778302814.mp3	0	0	t	2026-05-09 05:00:14.279	2026-05-09 05:00:14.279
cmoxvkzvy004ujv04g9cqhgql	TRILHAS CURTAS (175)			VINHETAS	/audios/track/69febf615ba43_1778302817.mp3	0	0	t	2026-05-09 05:00:17.595	2026-05-09 05:00:17.595
cmoxvl1rb004vjv04p97zrl4f	TRILHAS CURTAS (176)			VINHETAS	/audios/track/69febf63e008d_1778302819.mp3	0	0	t	2026-05-09 05:00:20.136	2026-05-09 05:00:20.136
cmoxvl3jk004wjv04esdpl0tg	TRILHAS CURTAS (177)			VINHETAS	/audios/track/69febf6637311_1778302822.mp3	0	0	t	2026-05-09 05:00:22.449	2026-05-09 05:00:22.449
cmoxvl5ng004xjv04s3ld75k0	TRILHAS CURTAS (178)			VINHETAS	/audios/track/69febf68eabf8_1778302824.mp3	0	0	t	2026-05-09 05:00:25.18	2026-05-09 05:00:25.18
cmoxvl88p004yjv047jl0wl56	TRILHAS CURTAS (179)			VINHETAS	/audios/track/69febf6c4e4f4_1778302828.mp3	0	0	t	2026-05-09 05:00:28.537	2026-05-09 05:00:28.537
cmoxvlag9004zjv04iz0x8c23	TRILHAS CURTAS (180)			VINHETAS	/audios/track/69febf6f2c99f_1778302831.mp3	0	0	t	2026-05-09 05:00:31.401	2026-05-09 05:00:31.401
cmoxvlckd0050jv047x60opbk	TRILHAS CURTAS (181)			VINHETAS	/audios/track/69febf71c577b_1778302833.mp3	0	0	t	2026-05-09 05:00:34.026	2026-05-09 05:00:34.026
cmoxvle7n0051jv04s1jua4zi	TRILHAS CURTAS (182)			VINHETAS	/audios/track/69febf740e617_1778302836.mp3	0	0	t	2026-05-09 05:00:36.276	2026-05-09 05:00:36.276
cmoxvlgjd0052jv04ffb927vk	TRILHAS CURTAS (183)			VINHETAS	/audios/track/69febf7710c41_1778302839.mp3	0	0	t	2026-05-09 05:00:39.29	2026-05-09 05:00:39.29
cmoxvliyl0053jv04abogiduc	TRILHAS CURTAS (184)			VINHETAS	/audios/track/69febf7a328e1_1778302842.mp3	0	0	t	2026-05-09 05:00:42.43	2026-05-09 05:00:42.43
cmoxvll6i0054jv04rhn1wzdw	TRILHAS CURTAS (185)			VINHETAS	/audios/track/69febf7d15d04_1778302845.mp3	0	0	t	2026-05-09 05:00:45.307	2026-05-09 05:00:45.307
cmoxvlnhh0055jv04vc5m5uem	TRILHAS CURTAS (186)			VINHETAS	/audios/track/69febf80124f7_1778302848.mp3	0	0	t	2026-05-09 05:00:48.294	2026-05-09 05:00:48.294
cmoxvlq490056jv049p4fo316	TRILHAS CURTAS (187)			VINHETAS	/audios/track/69febf8351116_1778302851.mp3	0	0	t	2026-05-09 05:00:51.591	2026-05-09 05:00:51.591
cmoxvls7t0057jv04dolqldf0	TRILHAS CURTAS (188)			VINHETAS	/audios/track/69febf8630f6a_1778302854.mp3	0	0	t	2026-05-09 05:00:54.425	2026-05-09 05:00:54.425
cmoxvlujq0058jv0489ogmqzz	TRILHAS CURTAS (189)			VINHETAS	/audios/track/69febf8934730_1778302857.mp3	0	0	t	2026-05-09 05:00:57.447	2026-05-09 05:00:57.447
cmoxvlwqy0059jv04htinbwzz	TRILHAS CURTAS (190)			VINHETAS	/audios/track/69febf8c11e37_1778302860.mp3	0	0	t	2026-05-09 05:01:00.299	2026-05-09 05:01:00.299
cmoxvlz2x005ajv04i02fwpy8	TRILHAS CURTAS (191)			VINHETAS	/audios/track/69febf8f185c4_1778302863.mp3	0	0	t	2026-05-09 05:01:03.322	2026-05-09 05:01:03.322
cmoxvm1ke005bjv04zhfm4noo	TRILHAS CURTAS (192)			VINHETAS	/audios/track/69febf924df31_1778302866.mp3	0	0	t	2026-05-09 05:01:06.542	2026-05-09 05:01:06.542
cmoxvm40a005cjv04tsoqtyay	TRILHAS CURTAS (193)			VINHETAS	/audios/track/69febf9559f2e_1778302869.mp3	0	0	t	2026-05-09 05:01:09.592	2026-05-09 05:01:09.592
cmoxvm67h005djv040j0j3c6m	TRILHAS CURTAS (194)			VINHETAS	/audios/track/69febf9850cc1_1778302872.mp3	0	0	t	2026-05-09 05:01:12.557	2026-05-09 05:01:12.557
cmoxvm88p005ejv049dtqif8w	TRILHAS CURTAS (195)			VINHETAS	/audios/track/69febf9aeb619_1778302874.mp3	0	0	t	2026-05-09 05:01:15.193	2026-05-09 05:01:15.193
cmoxvmame005fjv04tqlu8kpt	TRILHAS CURTAS (196)			VINHETAS	/audios/track/69febf9e0f339_1778302878.mp3	0	0	t	2026-05-09 05:01:18.278	2026-05-09 05:01:18.278
cmoxvmd2o005gjv04dgx2nsp2	TRILHAS CURTAS (197)			VINHETAS	/audios/track/69febfa1399f1_1778302881.mp3	0	0	t	2026-05-09 05:01:21.457	2026-05-09 05:01:21.457
cmoxvmfdg005hjv043aws92e2	TRILHAS CURTAS (198)			VINHETAS	/audios/track/69febfa433c69_1778302884.mp3	0	0	t	2026-05-09 05:01:24.436	2026-05-09 05:01:24.436
cmoxvmhv2005ijv0498og0bgm	TRILHAS CURTAS (199)			VINHETAS	/audios/track/69febfa74dcaa_1778302887.mp3	0	0	t	2026-05-09 05:01:27.547	2026-05-09 05:01:27.547
cmoxvmk4q005jjv044uxbq3yz	TRILHAS CURTAS (200)			VINHETAS	/audios/track/69febfaa5d0c1_1778302890.mp3	0	0	t	2026-05-09 05:01:30.603	2026-05-09 05:01:30.603
cmoxvmm7w005kjv04c73juxtm	TRILHAS CURTAS (201)			VINHETAS	/audios/track/69febfad13118_1778302893.mp3	0	0	t	2026-05-09 05:01:33.308	2026-05-09 05:01:33.308
cmoxvmond005ljv04a665xryk	TRILHAS CURTAS (202)			VINHETAS	/audios/track/69febfb0387ff_1778302896.mp3	0	0	t	2026-05-09 05:01:36.457	2026-05-09 05:01:36.457
cmoxvmr0u005mjv044b5sb4r2	TRILHAS CURTAS (203)			VINHETAS	/audios/track/69febfb34c2f9_1778302899.mp3	0	0	t	2026-05-09 05:01:39.534	2026-05-09 05:01:39.534
cmoxvmtdh005njv04abc7a8d7	TRILHAS CURTAS (204)			VINHETAS	/audios/track/69febfb657de5_1778302902.mp3	0	0	t	2026-05-09 05:01:42.582	2026-05-09 05:01:42.582
cmoxvmvnn005ojv04ulxizky0	TRILHAS CURTAS (205)			VINHETAS	/audios/track/69febfb932803_1778302905.mp3	0	0	t	2026-05-09 05:01:45.423	2026-05-09 05:01:45.423
cmoxvmxs2005pjv04y64a9zcw	TRILHAS CURTAS (206)			VINHETAS	/audios/track/69febfbc0faaa_1778302908.mp3	0	0	t	2026-05-09 05:01:48.29	2026-05-09 05:01:48.29
cmoxvn002005qjv04csuj0mim	TRILHAS CURTAS (207)			VINHETAS	/audios/track/69febfbee6fd3_1778302910.mp3	0	0	t	2026-05-09 05:01:51.171	2026-05-09 05:01:51.171
cmoxvn2mh005rjv04ykccoalj	TRILHAS CURTAS (208)			VINHETAS	/audios/track/69febfc254f8d_1778302914.mp3	0	0	t	2026-05-09 05:01:54.57	2026-05-09 05:01:54.57
cmoxvn4zc005sjv04puupiyas	TRILHAS CURTAS (209)			VINHETAS	/audios/track/69febfc561903_1778302917.mp3	0	0	t	2026-05-09 05:01:57.625	2026-05-09 05:01:57.625
cmoxvn7c3005tjv042kunhlub	TRILHAS CURTAS (210)			VINHETAS	/audios/track/69febfc850ae9_1778302920.mp3	0	0	t	2026-05-09 05:02:00.561	2026-05-09 05:02:00.561
cmoxvn9h4005ujv0405bkcrbh	TRILHAS CURTAS (211)			VINHETAS	/audios/track/69febfcb36b6a_1778302923.mp3	0	0	t	2026-05-09 05:02:03.448	2026-05-09 05:02:03.448
cmoxvnbrn005vjv04sr7kuoo5	TRILHAS CURTAS (212)			VINHETAS	/audios/track/69febfce2f0c4_1778302926.mp3	0	0	t	2026-05-09 05:02:06.419	2026-05-09 05:02:06.419
cmoxvndzs005wjv04ag08zcu1	TRILHAS CURTAS (213)			VINHETAS	/audios/track/69febfd112791_1778302929.mp3	0	0	t	2026-05-09 05:02:09.305	2026-05-09 05:02:09.305
cmoxvngg5005xjv04ni1nag46	TRILHAS CURTAS (214)			VINHETAS	/audios/track/69febfd436eb7_1778302932.mp3	0	0	t	2026-05-09 05:02:12.485	2026-05-09 05:02:12.485
cmoxvnimq005yjv04778dby2f	TRILHAS CURTAS (215)			VINHETAS	/audios/track/69febfd714203_1778302935.mp3	0	0	t	2026-05-09 05:02:15.315	2026-05-09 05:02:15.315
cmoxvnl0i005zjv045lntvylf	TRILHAS CURTAS (216)			VINHETAS	/audios/track/69febfda109fc_1778302938.mp3	0	0	t	2026-05-09 05:02:18.287	2026-05-09 05:02:18.287
cmoxvnncw0060jv04zylj9tzm	TRILHAS CURTAS (217)			VINHETAS	/audios/track/69febfdd359c7_1778302941.mp3	0	0	t	2026-05-09 05:02:21.441	2026-05-09 05:02:21.441
cmoxvnpqt0061jv04ttys5fni	TRILHAS CURTAS (218)			VINHETAS	/audios/track/69febfe031092_1778302944.mp3	0	0	t	2026-05-09 05:02:24.533	2026-05-09 05:02:24.533
cmoxvnrzm0062jv04farp39al	TRILHAS CURTAS (219)			VINHETAS	/audios/track/69febfe33563d_1778302947.mp3	0	0	t	2026-05-09 05:02:27.443	2026-05-09 05:02:27.443
cmoxvnudx0063jv041fka0m2b	TRILHAS CURTAS (220)			VINHETAS	/audios/track/69febfe64d093_1778302950.mp3	0	0	t	2026-05-09 05:02:30.549	2026-05-09 05:02:30.549
cmoxvnws00064jv0412zr6isy	TRILHAS CURTAS (221)			VINHETAS	/audios/track/69febfe94cd9f_1778302953.mp3	0	0	t	2026-05-09 05:02:33.534	2026-05-09 05:02:33.534
cmoxvnysy0065jv04uouybffa	TRILHAS CURTAS (222)			VINHETAS	/audios/track/69febfec0ceb8_1778302956.mp3	0	0	t	2026-05-09 05:02:36.274	2026-05-09 05:02:36.274
cmoxvo1530066jv0484olhwvh	TRILHAS CURTAS (223)			VINHETAS	/audios/track/69febfef14d63_1778302959.mp3	0	0	t	2026-05-09 05:02:39.304	2026-05-09 05:02:39.304
cmoxvo3ii0067jv04k5meq5rw	TRILHAS CURTAS (224)			VINHETAS	/audios/track/69febff2264a2_1778302962.mp3	0	0	t	2026-05-09 05:02:42.378	2026-05-09 05:02:42.378
cmoxvo64q0068jv04pcfyax3r	TRILHAS CURTAS (225)			VINHETAS	/audios/track/69febff583c2f_1778302965.mp3	0	0	t	2026-05-09 05:02:45.77	2026-05-09 05:02:45.77
cmoxvo89d0069jv04y5335u29	TRILHAS CURTAS (226)			VINHETAS	/audios/track/69febff84a152_1778302968.mp3	0	0	t	2026-05-09 05:02:48.529	2026-05-09 05:02:48.529
cmoxvoaou006ajv04jrak2ykz	TRILHAS CURTAS (227)			VINHETAS	/audios/track/69febffb52bdb_1778302971.mp3	0	0	t	2026-05-09 05:02:51.564	2026-05-09 05:02:51.564
cmoxvoct3006bjv048xpnez4g	TRILHAS CURTAS (228)			VINHETAS	/audios/track/69febffe3292b_1778302974.mp3	0	0	t	2026-05-09 05:02:54.423	2026-05-09 05:02:54.423
cmoxvof8j006cjv04gvo0s4qd	TRILHAS CURTAS (229)			VINHETAS	/audios/track/69fec001553e6_1778302977.mp3	0	0	t	2026-05-09 05:02:57.571	2026-05-09 05:02:57.571
cmoxvohim006djv04xv4uwanj	TRILHAS CURTAS (230)			VINHETAS	/audios/track/69fec0044aaa9_1778302980.mp3	0	0	t	2026-05-09 05:03:00.526	2026-05-09 05:03:00.526
cmoxvojuj006ejv044nwh2bfk	TRILHAS CURTAS (231)			VINHETAS	/audios/track/69fec0074ccff_1778302983.mp3	0	0	t	2026-05-09 05:03:03.548	2026-05-09 05:03:03.548
cmoxvom6r006fjv04hgzcpjtr	TRILHAS CURTAS (232)			VINHETAS	/audios/track/69fec00a5544f_1778302986.mp3	0	0	t	2026-05-09 05:03:06.58	2026-05-09 05:03:06.58
cmoxvool5006gjv04dekn33bn	TRILHAS CURTAS (233)			VINHETAS	/audios/track/69fec00d56032_1778302989.mp3	0	0	t	2026-05-09 05:03:09.575	2026-05-09 05:03:09.575
cmoxvoqs0006hjv04g0d270k9	TRILHAS CURTAS (234)			VINHETAS	/audios/track/69fec0104b2e6_1778302992.mp3	0	0	t	2026-05-09 05:03:12.528	2026-05-09 05:03:12.528
cmoxvot3k006ijv04qqm6je2x	TRILHAS CURTAS (235)			VINHETAS	/audios/track/69fec0134d0e4_1778302995.mp3	0	0	t	2026-05-09 05:03:15.536	2026-05-09 05:03:15.536
cmoxvovb9006jjv04hxhdyyc2	TRILHAS CURTAS (236)			VINHETAS	/audios/track/69fec0162cbd5_1778302998.mp3	0	0	t	2026-05-09 05:03:18.405	2026-05-09 05:03:18.405
cmoxvoxiz006kjv04a68n9frv	TRILHAS CURTAS (237)			VINHETAS	/audios/track/69fec0190d681_1778303001.mp3	0	0	t	2026-05-09 05:03:21.275	2026-05-09 05:03:21.275
cmoxvp01o006ljv042vgup7r0	TRILHAS CURTAS (238)			VINHETAS	/audios/track/69fec01c4e0bc_1778303004.mp3	0	0	t	2026-05-09 05:03:24.541	2026-05-09 05:03:24.541
cmoxvp2jx006mjv043wfb5hf0	TRILHAS CURTAS (239)			VINHETAS	/audios/track/69fec01f6c7c6_1778303007.mp3	0	0	t	2026-05-09 05:03:27.674	2026-05-09 05:03:27.674
cmoxvp4le006njv049ezstquw	TRILHAS CURTAS (240)			VINHETAS	/audios/track/69fec02234451_1778303010.mp3	0	0	t	2026-05-09 05:03:30.434	2026-05-09 05:03:30.434
cmoxvp70i006ojv04rxc4g6ug	TRILHAS CURTAS (241)			VINHETAS	/audios/track/69fec02554aca_1778303013.mp3	0	0	t	2026-05-09 05:03:33.571	2026-05-09 05:03:33.571
cmoxvp9eq006pjv04pg73qzi7	TRILHAS CURTAS (242)			VINHETAS	/audios/track/69fec0286d4f1_1778303016.mp3	0	0	t	2026-05-09 05:03:36.674	2026-05-09 05:03:36.674
cmoxvpbty006qjv04fz18fpcq	TRILHAS CURTAS (243)			VINHETAS	/audios/track/69fec02b92728_1778303019.mp3	0	0	t	2026-05-09 05:03:39.814	2026-05-09 05:03:39.814
cmoxvpdud006rjv04hoe57st7	TRILHAS CURTAS (244)			VINHETAS	/audios/track/69fec02e335d3_1778303022.mp3	0	0	t	2026-05-09 05:03:42.422	2026-05-09 05:03:42.422
cmoxvpgbo006sjv04a8l7hsty	TRILHAS CURTAS (245)			VINHETAS	/audios/track/69fec0314a3ba_1778303025.mp3	0	0	t	2026-05-09 05:03:45.522	2026-05-09 05:03:45.522
cmoxvpijq006tjv04q6quxrqx	TRILHAS CURTAS (246)			VINHETAS	/audios/track/69fec0344b05b_1778303028.mp3	0	0	t	2026-05-09 05:03:48.518	2026-05-09 05:03:48.518
cmoxvpksg006ujv04cnm01pw8	TRILHAS CURTAS (247)			VINHETAS	/audios/track/69fec03732e81_1778303031.mp3	0	0	t	2026-05-09 05:03:51.424	2026-05-09 05:03:51.424
cmoxvpn3o006vjv04voud97ve	TRILHAS CURTAS (248)			VINHETAS	/audios/track/69fec03a32ac6_1778303034.mp3	0	0	t	2026-05-09 05:03:54.42	2026-05-09 05:03:54.42
cmoxvppeg006wjv04dxc5ds2w	TRILHAS CURTAS (249)			VINHETAS	/audios/track/69fec03d2d9dc_1778303037.mp3	0	0	t	2026-05-09 05:03:57.4	2026-05-09 05:03:57.4
cmoxvps24006xjv04cmzr9q1b	TRILHAS CURTAS (250)			VINHETAS	/audios/track/69fec04079c92_1778303040.mp3	0	0	t	2026-05-09 05:04:00.73	2026-05-09 05:04:00.73
cmoxvpu7w006yjv04qaxcsh4v	TRILHAS CURTAS (251)			VINHETAS	/audios/track/69fec043687b1_1778303043.mp3	0	0	t	2026-05-09 05:04:03.645	2026-05-09 05:04:03.645
cmoxvpwfm006zjv04f6o01879	TRILHAS CURTAS (252)			VINHETAS	/audios/track/69fec0464979c_1778303046.mp3	0	0	t	2026-05-09 05:04:06.514	2026-05-09 05:04:06.514
cmoxvpyrw0070jv04ka3soc5t	TRILHAS CURTAS (253)			VINHETAS	/audios/track/69fec04951b54_1778303049.mp3	0	0	t	2026-05-09 05:04:09.548	2026-05-09 05:04:09.548
cmoxvq17f0071jv04sz8uizwj	TRILHAS CURTAS (254)			VINHETAS	/audios/track/69fec04c71c29_1778303052.mp3	0	0	t	2026-05-09 05:04:12.699	2026-05-09 05:04:12.699
cmoxvq3e80072jv04y0aj9y3v	TRILHAS CURTAS (255)			VINHETAS	/audios/track/69fec04f4f572_1778303055.mp3	0	0	t	2026-05-09 05:04:15.536	2026-05-09 05:04:15.536
cmoxvq5ss0073jv04d9xij1fz	TRILHAS CURTAS (256)			VINHETAS	/audios/track/69fec0524f651_1778303058.mp3	0	0	t	2026-05-09 05:04:18.537	2026-05-09 05:04:18.537
cmoxvq83r0074jv04blpbvhku	TRILHAS CURTAS (257)			VINHETAS	/audios/track/69fec055650bf_1778303061.mp3	0	0	t	2026-05-09 05:04:21.639	2026-05-09 05:04:21.639
cmoxvqa8s0075jv044cbma7uk	TRILHAS CURTAS (258)			VINHETAS	/audios/track/69fec05830fdf_1778303064.mp3	0	0	t	2026-05-09 05:04:24.412	2026-05-09 05:04:24.412
cmoxvqck40076jv04vvagfopm	TRILHAS CURTAS (259)			VINHETAS	/audios/track/69fec05b2cd2c_1778303067.mp3	0	0	t	2026-05-09 05:04:27.413	2026-05-09 05:04:27.413
cmoxvqeup0077jv042xxchslp	TRILHAS CURTAS (260)			VINHETAS	/audios/track/69fec05e27fa7_1778303070.mp3	0	0	t	2026-05-09 05:04:30.385	2026-05-09 05:04:30.385
cmoxvqh6c0078jv04lgjlgihy	TRILHAS CURTAS (261)			VINHETAS	/audios/track/69fec0612d5f5_1778303073.mp3	0	0	t	2026-05-09 05:04:33.397	2026-05-09 05:04:33.397
cmoxvqjl80079jv0412f75kn0	TRILHAS CURTAS (262)			VINHETAS	/audios/track/69fec0642e2a7_1778303076.mp3	0	0	t	2026-05-09 05:04:36.409	2026-05-09 05:04:36.409
cmoxvqlwg007ajv041uejo6dz	TRILHAS CURTAS (263)			VINHETAS	/audios/track/69fec06749386_1778303079.mp3	0	0	t	2026-05-09 05:04:39.52	2026-05-09 05:04:39.52
cmoxvqo57007bjv048w1pxp5w	TRILHAS CURTAS (264)			VINHETAS	/audios/track/69fec06a342c2_1778303082.mp3	0	0	t	2026-05-09 05:04:42.428	2026-05-09 05:04:42.428
cmoxvqqgf007cjv04p2q5c9x5	TRILHAS CURTAS (265)			VINHETAS	/audios/track/69fec06d32bd8_1778303085.mp3	0	0	t	2026-05-09 05:04:45.423	2026-05-09 05:04:45.423
cmoxvqt6o007djv04fo6g1vrj	TRILHAS CURTAS (266)			VINHETAS	/audios/track/69fec0700a4a5_1778303088.mp3	0	0	t	2026-05-09 05:04:48.256	2026-05-09 05:04:48.256
cmoxvquys007ejv04gaxyedvs	TRILHAS CURTAS (267)			VINHETAS	/audios/track/69fec0730bf14_1778303091.mp3	0	0	t	2026-05-09 05:04:51.269	2026-05-09 05:04:51.269
cmoxvqxhh007fjv041lnjxevx	TRILHAS CURTAS (268)			VINHETAS	/audios/track/69fec0764d71b_1778303094.mp3	0	0	t	2026-05-09 05:04:54.533	2026-05-09 05:04:54.533
cmoxvqzoy007gjv0447jz6vw8	TRILHAS CURTAS (269)			VINHETAS	/audios/track/69fec0792ccda_1778303097.mp3	0	0	t	2026-05-09 05:04:57.395	2026-05-09 05:04:57.395
cmoxvr242007hjv04k5i7euso	TRILHAS CURTAS (270)			VINHETAS	/audios/track/69fec07c4d2e6_1778303100.mp3	0	0	t	2026-05-09 05:05:00.53	2026-05-09 05:05:00.53
cmoxvr4b9007ijv04kfuvfnwe	TRILHAS CURTAS (271)			VINHETAS	/audios/track/69fec07f2862f_1778303103.mp3	0	0	t	2026-05-09 05:05:03.381	2026-05-09 05:05:03.381
cmoxvr6mr007jjv04tjedbul3	TRILHAS CURTAS (272)			VINHETAS	/audios/track/69fec0820df0a_1778303106.mp3	0	0	t	2026-05-09 05:05:06.272	2026-05-09 05:05:06.272
cmoym0ey20001l80484h3q7ec	SEXY (2)			SEXY	/audios/track/69ff6cc6ce731_1778347206.mp3	0	0	t	2026-05-09 17:20:07.082	2026-05-09 17:20:07.082
cmoym0ho30002l804kctddnjk	SEXY (3)			SEXY	/audios/track/69ff6cca5d8e6_1778347210.mp3	0	0	t	2026-05-09 17:20:10.611	2026-05-09 17:20:10.611
cmoym0th50003l804vp92qlvr	SEXY (4)			SEXY	/audios/track/69ff6cd984fa5_1778347225.mp3	0	0	t	2026-05-09 17:20:25.799	2026-05-09 17:20:25.799
cmoym14z30004l804m4evcvi4	SEXY (5)			SEXY	/audios/track/69ff6ce88d2e6_1778347240.mp3	0	0	t	2026-05-09 17:20:40.815	2026-05-09 17:20:40.815
cmoym18kd0005l804m0tldx45	SEXY (6)			SEXY	/audios/track/69ff6ced20826_1778347245.mp3	0	0	t	2026-05-09 17:20:45.354	2026-05-09 17:20:45.354
cmoym1mem0006l804p6nn8mbu	SEXY (8)			SEXY	/audios/track/69ff6cff0f6aa_1778347263.mp3	0	0	t	2026-05-09 17:21:03.291	2026-05-09 17:21:03.291
cmoym1qct0007l804zasjzoro	SEXY (9)			SEXY	/audios/track/69ff6d0449e42_1778347268.mp3	0	0	t	2026-05-09 17:21:08.525	2026-05-09 17:21:08.525
cmoym22010008l8046nggrwf2	SEXY (10)			SEXY	/audios/track/69ff6d13438ff_1778347283.mp3	0	0	t	2026-05-09 17:21:23.502	2026-05-09 17:21:23.502
cmoym2cz50009l804xw4m0m53	SEXY (11)			SEXY	/audios/track/69ff6d2193691_1778347297.mp3	0	0	t	2026-05-09 17:21:37.842	2026-05-09 17:21:37.842
cmoym2gly000al804p1msulrw	SEXY (12)			SEXY	/audios/track/69ff6d26331b0_1778347302.mp3	0	0	t	2026-05-09 17:21:42.435	2026-05-09 17:21:42.435
cmoym2k9v000bl804ucfjngbu	SEXY (13)			SEXY	/audios/track/69ff6d2b0f0c9_1778347307.mp3	0	0	t	2026-05-09 17:21:47.299	2026-05-09 17:21:47.299
cmoym2nup000cl804ac7xjlom	SEXY (14)			SEXY	/audios/track/69ff6d2fa9918_1778347311.mp3	0	0	t	2026-05-09 17:21:51.937	2026-05-09 17:21:51.937
cmoym2zjf000dl8047u45fh32	SEXY (15)			SEXY	/audios/track/69ff6d3eb3af0_1778347326.mp3	0	0	t	2026-05-09 17:22:06.969	2026-05-09 17:22:06.969
cmoym3b9h000el804rgny8b1j	SEXY (16)			SEXY	/audios/track/69ff6d4de66eb_1778347341.mp3	0	0	t	2026-05-09 17:22:22.163	2026-05-09 17:22:22.163
cmoym3n89000fl804nmrw351n	SEXY (17)			SEXY	/audios/track/69ff6d5d6b0a3_1778347357.mp3	0	0	t	2026-05-09 17:22:37.67	2026-05-09 17:22:37.67
cmoym3z4k000gl8046zk9eem3	SEXY (18)			SEXY	/audios/track/69ff6d6ccdae9_1778347372.mp3	0	0	t	2026-05-09 17:22:53.089	2026-05-09 17:22:53.089
cmoym4b8i000hl804xamjjuez	SEXY (19)			SEXY	/audios/track/69ff6d7c8612e_1778347388.mp3	0	0	t	2026-05-09 17:23:08.784	2026-05-09 17:23:08.784
cmoym4dj5000il804vki4h5kd	SEXY (20)			SEXY	/audios/track/69ff6d7f9b60c_1778347391.mp3	0	0	t	2026-05-09 17:23:11.874	2026-05-09 17:23:11.874
cmoymnw4b0000le047z0buhyf	lucy_o_sne-beautiful-day-431057			ALEGRE	/audios/track/69ff710e07d5f_1778348302.mp3	0	0	t	2026-05-09 17:38:22.315	2026-05-09 17:38:22.315
cmoymo27s0001le04pyyp0639	angel4leon-d-day-190126			ALEGRE	/audios/track/69ff711618036_1778348310.mp3	0	0	t	2026-05-09 17:38:30.328	2026-05-09 17:38:30.328
cmoymo8yk0002le04k2ur623w	tawipop-baking-day-1-343331			ALEGRE	/audios/track/69ff711eace33_1778348318.mp3	0	0	t	2026-05-09 17:38:38.956	2026-05-09 17:38:38.956
cmoymof1b0003le04cw7sqe6y	ikoliks_aj-acoustic-spring-mothers-day-music-320427			ALEGRE	/audios/track/69ff7126afb8c_1778348326.mp3	0	0	t	2026-05-09 17:38:46.943	2026-05-09 17:38:46.943
cmoymp1me0002jo04mub8riar	kaazoom-for-dad-a-song-for-fatherx27s-day-from-a-daughter-342693			Dia das Mães	/audios/track/69ff7143d28ac_1778348355.mp3	0	0	t	2026-05-09 17:39:16.101	2026-05-09 17:39:16.101
cmoympd540003jo04txbo9qex	prettyjohn1-international-womens-day-483384			Dia das Mães	/audios/track/69ff7152e0e87_1778348370.mp3	0	0	t	2026-05-09 17:39:31.144	2026-05-09 17:39:31.144
cmoympngr0004jo04rw5buxqf	bombinsound-international-womens-day-490545			Dia das Mães	/audios/track/69ff71602ad98_1778348384.mp3	0	0	t	2026-05-09 17:39:44.41	2026-05-09 17:39:44.41
cmoympu4n0005jo042frrz2g1	lp-studio-music-motherx27s-day-327719			Dia das Mães	/audios/track/69ff7168e428d_1778348392.mp3	0	0	t	2026-05-09 17:39:53.16	2026-05-09 17:39:53.16
cmoymq5dp0006jo048xc0csfw	soundoffreedom-cinematic-indie-music-408602			Dia das Mães	/audios/track/69ff717760f5d_1778348407.mp3	0	0	t	2026-05-09 17:40:07.627	2026-05-09 17:40:07.627
cmoymqg2f0007jo04et54vnsx	crystaleyeofficial-fatherx27s-motherx27s-love-background-music-350335			Dia das Mães	/audios/track/69ff718559060_1778348421.mp3	0	0	t	2026-05-09 17:40:21.591	2026-05-09 17:40:21.591
cmoymqqup0008jo049vhtkyo1	kaazoom-a-motherx27s-heart-a-song-for-motherx27s-day-333288			Dia das Mães	/audios/track/69ff7193381da_1778348435.mp3	0	0	t	2026-05-09 17:40:35.456	2026-05-09 17:40:35.456
cmoymqwkm0009jo04qfzl7cf8	kaazoom-a-song-for-mom-version-2-a-motherx27s-day-song-from-her-son-334591			Dia das Mães	/audios/track/69ff719ab8b2a_1778348442.mp3	0	0	t	2026-05-09 17:40:42.982	2026-05-09 17:40:42.982
cmoymr341000ajo04cgnba7z2	annanrandyfuchs-happy-mothers-day-338755			Dia das Mães	/audios/track/69ff71a3159fc_1778348451.mp3	0	0	t	2026-05-09 17:40:51.344	2026-05-09 17:40:51.344
cmoymr6hu000bjo04aa3actqe	bombinsound-the-motherx27s-day-56-second-491966			Dia das Mães	/audios/track/69ff71a79882a_1778348455.mp3	0	0	t	2026-05-09 17:40:55.842	2026-05-09 17:40:55.842
cmoymrcze000cjo04wgajlbns	bombinsound-the-motherx27s-day-491968			Dia das Mães	/audios/track/69ff71b006629_1778348464.mp3	0	0	t	2026-05-09 17:41:04.25	2026-05-09 17:41:04.25
cmoyqavro0000ju04ix3kfz6z	ROCK (1)			ROCK	/audios/track/69ff88eb3f65e_1778354411.mp3	0	0	t	2026-05-09 19:20:13.905	2026-05-09 19:20:13.905
cmoyqb1ue0001ju04tfdi9t6y	ROCK (2)			ROCK	/audios/track/69ff88f57f6a9_1778354421.mp3	0	0	t	2026-05-09 19:20:21.783	2026-05-09 19:20:21.783
cmoyqb8do0002ju04558rtulm	ROCK (3)			ROCK	/audios/track/69ff88fdd613c_1778354429.mp3	0	0	t	2026-05-09 19:20:30.141	2026-05-09 19:20:30.141
cmoyqbf9k0003ju04mfqzv6d6	ROCK (4)			ROCK	/audios/track/69ff8906e57aa_1778354438.mp3	0	0	t	2026-05-09 19:20:39.176	2026-05-09 19:20:39.176
cmoyqbl410004ju04kvmy52nn	ROCK (5)			ROCK	/audios/track/69ff890e66d06_1778354446.mp3	0	0	t	2026-05-09 19:20:46.642	2026-05-09 19:20:46.642
cmoyqbun60005ju0471t29yut	ROCK (6)			ROCK	/audios/track/69ff891ace0bd_1778354458.mp3	0	0	t	2026-05-09 19:20:59.107	2026-05-09 19:20:59.107
cmoyqc45l0006ju04yo09j4nr	ROCK (7)			ROCK	/audios/track/69ff892719c38_1778354471.mp3	0	0	t	2026-05-09 19:21:11.321	2026-05-09 19:21:11.321
cmoyqcd710007ju046wwj74ci	ROCK (8)			ROCK	/audios/track/69ff8932e1b25_1778354482.mp3	0	0	t	2026-05-09 19:21:23.149	2026-05-09 19:21:23.149
cmoyqcfys0008ju04vf9y83s4	ROCK (9)			ROCK	/audios/track/69ff8936620de_1778354486.mp3	0	0	t	2026-05-09 19:21:26.629	2026-05-09 19:21:26.629
cmoyqcqsw0009ju04tjuhtdlf	ROCK (10)			ROCK	/audios/track/69ff894486fc8_1778354500.mp3	0	0	t	2026-05-09 19:21:40.784	2026-05-09 19:21:40.784
cmoyqeili0000kz042vdbuicc	HIP HOP (1)			HIP HOP	/audios/track/69ff8997182d5_1778354583.mp3	0	0	t	2026-05-09 19:23:03.347	2026-05-09 19:23:03.347
cmoyqekno0001kz045htixe66	HIP HOP (2)			HIP HOP	/audios/track/69ff8999dec01_1778354585.mp3	0	0	t	2026-05-09 19:23:06.132	2026-05-09 19:23:06.132
cmoyqen8n0002kz04ujobr2q1	HIP HOP (3)			HIP HOP	/audios/track/69ff899d3f561_1778354589.mp3	0	0	t	2026-05-09 19:23:09.48	2026-05-09 19:23:09.48
cmoyqeplp0003kz04d1dmjuq7	HIP HOP (4)			HIP HOP	/audios/track/69ff89a04c63e_1778354592.mp3	0	0	t	2026-05-09 19:23:12.541	2026-05-09 19:23:12.541
cmoyqes5d0004kz04nigp9ucf	HIP HOP (5)			HIP HOP	/audios/track/69ff89a3992e3_1778354595.mp3	0	0	t	2026-05-09 19:23:15.841	2026-05-09 19:23:15.841
cmoyqf25c0005kz04j9ml31pa	HIP HOP (6)			HIP HOP	/audios/track/69ff89b06bd1b_1778354608.mp3	0	0	t	2026-05-09 19:23:28.686	2026-05-09 19:23:28.686
cmoyqfcjm0006kz04ezmh5kbh	HIP HOP (7)			HIP HOP	/audios/track/69ff89be0ac8d_1778354622.mp3	0	0	t	2026-05-09 19:23:42.275	2026-05-09 19:23:42.275
cmoyqffso0007kz041mwoc7is	HIP HOP (8)			HIP HOP	/audios/track/69ff89c22022c_1778354626.mp3	0	0	t	2026-05-09 19:23:46.374	2026-05-09 19:23:46.374
cmoyqfm8u0008kz049b59t0ph	HIP HOP (9)			HIP HOP	/audios/track/69ff89ca94411_1778354634.mp3	0	0	t	2026-05-09 19:23:54.847	2026-05-09 19:23:54.847
cmoyqfo2p0009kz04t2onmj1x	HIP HOP (10)			HIP HOP	/audios/track/69ff89ccf1c88_1778354636.mp3	0	0	t	2026-05-09 19:23:57.217	2026-05-09 19:23:57.217
cmoyqfq2a000akz04x0ruh6rj	HIP HOP (11)			HIP HOP	/audios/track/69ff89cf899dd_1778354639.mp3	0	0	t	2026-05-09 19:23:59.794	2026-05-09 19:23:59.794
cmoyqfsdx000bkz04uvgufll3	HIP HOP (12)			HIP HOP	/audios/track/69ff89d272093_1778354642.mp3	0	0	t	2026-05-09 19:24:02.692	2026-05-09 19:24:02.692
cmoyqfuq2000ckz047ocl7xlb	HIP HOP (13)			HIP HOP	/audios/track/69ff89d594a01_1778354645.mp3	0	0	t	2026-05-09 19:24:05.834	2026-05-09 19:24:05.834
cmoyqfx84000dkz049a5xgdju	HIP HOP (14)			HIP HOP	/audios/track/69ff89d8cd45d_1778354648.mp3	0	0	t	2026-05-09 19:24:09.077	2026-05-09 19:24:09.077
cmoyqg30r000ekz044biaimvz	HIP HOP (15)			HIP HOP	/audios/track/69ff89e05a89e_1778354656.mp3	0	0	t	2026-05-09 19:24:16.587	2026-05-09 19:24:16.587
cmoyqhxsg0000jo042oygt01n	BOSSA (1)			BOSSA	/audios/track/69ff8a36b8f4e_1778354742.mp3	0	0	t	2026-05-09 19:25:43.008	2026-05-09 19:25:43.008
cmoyqi13k0001jo04elnjsc41	BOSSA (2)			BOSSA	/audios/track/69ff8a3b2dc03_1778354747.mp3	0	0	t	2026-05-09 19:25:47.408	2026-05-09 19:25:47.408
cmoyqnj7f0001l70404etwgmq	BOSSA (33)			BOSSA	/audios/track/69ff8b3be129e_1778355003.mp3	0	0	t	2026-05-09 19:30:04.155	2026-05-09 19:30:04.155
cmoyqnlte0002l704s9vrt1d0	BOSSA (34)			BOSSA	/audios/track/69ff8b3f504e1_1778355007.mp3	0	0	t	2026-05-09 19:30:07.538	2026-05-09 19:30:07.538
cmoyqmc00000ljo041crmga8c	BOSSA (27)			BOSSA	/audios/track/69ff8b03ca39a_1778354947.mp3	0	0	t	2026-05-09 19:29:08.048	2026-05-09 19:30:43.125
cmoxv6ep50000l6049wtapind	TECNOLOGIA (1)			TECNOLOGIA	/audios/track/69ffbc4e01b4c_1778367566.mp3	0	0	t	2026-05-09 04:48:56.36	2026-05-09 22:59:26.472
cmpsdbwm8000d8usxpbwq33vs	[000004]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1b3db150_1780146611.mp3	0	0	t	2026-05-30 13:10:11.936	2026-05-30 13:10:11.936
cmpsdbxny000e8usxwzk98c45	[000005]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1b54176f_1780146613.mp3	0	0	t	2026-05-30 13:10:13.295	2026-05-30 13:10:13.295
cmpsdbymq000f8usx85tjnh07	[000006]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1b67f8fe_1780146614.mp3	0	0	t	2026-05-30 13:10:14.547	2026-05-30 13:10:14.547
cmpsdbzxx000g8usx7uk2wk4c	[000008]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1b83563e_1780146616.mp3	0	0	t	2026-05-30 13:10:16.245	2026-05-30 13:10:16.245
cmpsdc1eq000h8usx1al49528	[000009]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1ba1d9d5_1780146618.mp3	0	0	t	2026-05-30 13:10:18.146	2026-05-30 13:10:18.146
cmpsdccic000i8usx43att4aq	[000010]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1c87b49e_1780146632.mp3	0	0	t	2026-05-30 13:10:32.533	2026-05-30 13:10:32.533
cmpsdcoog000j8usxaialrq1w	[000011]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1d84386e_1780146648.mp3	0	0	t	2026-05-30 13:10:48.305	2026-05-30 13:10:48.305
cmpsdczo6000k8usx1smdlmev	[000012]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1e67fb83_1780146662.mp3	0	0	t	2026-05-30 13:11:02.551	2026-05-30 13:11:02.551
cmpsdd0v6000l8usx9neutfnr	[000013]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1e810cb7_1780146664.mp3	0	0	t	2026-05-30 13:11:04.098	2026-05-30 13:11:04.098
cmpsddbnz000m8usxfzxllouq	[000014]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1f610568_1780146678.mp3	0	0	t	2026-05-30 13:11:18.095	2026-05-30 13:11:18.095
cmpsddczw000n8usxvrmmw94j	[000015]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1f7c2401_1780146679.mp3	0	0	t	2026-05-30 13:11:19.821	2026-05-30 13:11:19.821
cmpsddeje000o8usx83ldrfn7	[000016]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1f9c232c_1780146681.mp3	0	0	t	2026-05-30 13:11:21.818	2026-05-30 13:11:21.818
cmpsddg2v000p8usx3qw8vqs9	[000017]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae1fbc1123_1780146683.mp3	0	0	t	2026-05-30 13:11:23.815	2026-05-30 13:11:23.815
cmpsddp2f000q8usxmsfv3qq4	[000018]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae2076a6ed_1780146695.mp3	0	0	t	2026-05-30 13:11:35.464	2026-05-30 13:11:35.464
cmpsddxv0000r8usxcnc1z4e5	[000019]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae212cb665_1780146706.mp3	0	0	t	2026-05-30 13:11:46.86	2026-05-30 13:11:46.86
cmpsddzde000s8usxr5eim05r	[000020]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae214c19ee_1780146708.mp3	0	0	t	2026-05-30 13:11:48.818	2026-05-30 13:11:48.818
cmpsde12y000t8usxokt5whb0	[000021]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae216ee2f5_1780146710.mp3	0	0	t	2026-05-30 13:11:51.034	2026-05-30 13:11:51.034
cmpsdean4000u8usxf3m8ttik	[000024]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae2236089d_1780146723.mp3	0	0	t	2026-05-30 13:12:03.424	2026-05-30 13:12:03.424
cmpsdebtd000v8usxvid8g2yh	[000025]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae224e0f9a_1780146724.mp3	0	0	t	2026-05-30 13:12:04.946	2026-05-30 13:12:04.946
cmpsdede1000w8usxu00oxsbg	[000026]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae226e907c_1780146726.mp3	0	0	t	2026-05-30 13:12:06.986	2026-05-30 13:12:06.986
cmpsdef3i000x8usxk04p3l94	[000029]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae22928cc9_1780146729.mp3	0	0	t	2026-05-30 13:12:09.199	2026-05-30 13:12:09.199
cmpsdegeb000y8usxf0914y7u	[000031]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae22ad1eab_1780146730.mp3	0	0	t	2026-05-30 13:12:10.883	2026-05-30 13:12:10.883
cmpsdei4v000z8usx09yahi78	[000032]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae22d18ee8_1780146733.mp3	0	0	t	2026-05-30 13:12:13.135	2026-05-30 13:12:13.135
cmpsdejla00108usx5050esy5	[000033]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae22ef3b04_1780146734.mp3	0	0	t	2026-05-30 13:12:15.023	2026-05-30 13:12:15.023
cmpsdes9x00118usxbe5n25q8	[000034]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae23a3d202_1780146746.mp3	0	0	t	2026-05-30 13:12:26.278	2026-05-30 13:12:26.278
cmpsdeuiv00128usx9210y5v1	[000038]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae23d2772e_1780146749.mp3	0	0	t	2026-05-30 13:12:29.191	2026-05-30 13:12:29.191
cmpsdeyjm00138usx7oa9w2ty	[000039]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae2425b0a0_1780146754.mp3	0	0	t	2026-05-30 13:12:34.402	2026-05-30 13:12:34.402
cmpsdf2b300148usxzpcwzei2	[000040]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae2473d2c1_1780146759.mp3	0	0	t	2026-05-30 13:12:39.28	2026-05-30 13:12:39.28
cmpsdf64f00158usxqy28gozu	[000041]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae24c2f438_1780146764.mp3	0	0	t	2026-05-30 13:12:44.223	2026-05-30 13:12:44.223
cmpsdf9t800168usxkegv33wb	[000042]			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae250edda9_1780146768.mp3	0	0	t	2026-05-30 13:12:49.004	2026-05-30 13:12:49.004
cmpsdfaq500178usxfyl7pduz	aplausos			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae25227ae0_1780146770.mp3	0	0	t	2026-05-30 13:12:50.189	2026-05-30 13:12:50.189
cmpsdfbm100188usx4ouyav31	bom..			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae2534c509_1780146771.mp3	0	0	t	2026-05-30 13:12:51.337	2026-05-30 13:12:51.337
cmpsdfcig00198usxjvjfqkyi	flash bac			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae25473a95_1780146772.mp3	0	0	t	2026-05-30 13:12:52.504	2026-05-30 13:12:52.504
cmpsdflj7001a8usx17b9if7t	flash back			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae26029002_1780146784.mp3	0	0	t	2026-05-30 13:13:04.196	2026-05-30 13:13:04.196
cmpsdfmvy001b8usxd0a5u5is	GLOBO			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae261e1a61_1780146785.mp3	0	0	t	2026-05-30 13:13:05.95	2026-05-30 13:13:05.95
cmpsdfois001c8usx1ehc2jqp	okokok			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae2640912b_1780146788.mp3	0	0	t	2026-05-30 13:13:08.069	2026-05-30 13:13:08.069
cmpsdfpwm001d8usx2fg8zoo0	rabugento			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae265cc7cd_1780146789.mp3	0	0	t	2026-05-30 13:13:09.863	2026-05-30 13:13:09.863
cmpsdfrgu001e8usx668uruw0	Soud Effects - 89. Efeitos especiais 8			EFEITOS	https://api.cvmnews.com.br/audios/track/6a1ae267d26f0_1780146791.mp3	0	0	t	2026-05-30 13:13:11.887	2026-05-30 13:13:11.887
cmpuotjwn000b8udby6oh5u4n	Track  1			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d057b57327_1780286843.mp3	0	0	t	2026-06-01 04:07:23.399	2026-06-01 04:07:23.399
cmpuotktv000c8udb21s3lfth	Track  2			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d057c89a73_1780286844.mp3	0	0	t	2026-06-01 04:07:24.596	2026-06-01 04:07:24.596
cmpuotlt1000d8udb7ufy4g1e	Track  3			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d057dc9009_1780286845.mp3	0	0	t	2026-06-01 04:07:25.862	2026-06-01 04:07:25.862
cmpuotmp0000e8udb6bkhsesc	Track  4			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d057eef1c4_1780286846.mp3	0	0	t	2026-06-01 04:07:27.012	2026-06-01 04:07:27.012
cmpuotnnn000f8udbmnis4wn7	Track  5			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0580379d5_1780286848.mp3	0	0	t	2026-06-01 04:07:28.26	2026-06-01 04:07:28.26
cmpuotomx000g8udbjkcjt1nc	Track  6			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d058178b41_1780286849.mp3	0	0	t	2026-06-01 04:07:29.53	2026-06-01 04:07:29.53
cmpuotpm1000h8udb0csfinyz	Track  7			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0582b8f31_1780286850.mp3	0	0	t	2026-06-01 04:07:30.793	2026-06-01 04:07:30.793
cmpuotqka000i8udbgx6o6zet	Track  8			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0583f25df_1780286851.mp3	0	0	t	2026-06-01 04:07:32.026	2026-06-01 04:07:32.026
cmpuotrip000j8udbhwhbbu29	Track  9			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0585389da_1780286853.mp3	0	0	t	2026-06-01 04:07:33.265	2026-06-01 04:07:33.265
cmpuotsfg000k8udb52wbiy46	Track 10			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0586649ee_1780286854.mp3	0	0	t	2026-06-01 04:07:34.444	2026-06-01 04:07:34.444
cmpuottdv000l8udbxcdvxqei	Track 11			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05879deeb_1780286855.mp3	0	0	t	2026-06-01 04:07:35.683	2026-06-01 04:07:35.683
cmpuotucl000m8udbqd17virk	Track 12			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0588dc165_1780286856.mp3	0	0	t	2026-06-01 04:07:36.933	2026-06-01 04:07:36.933
cmpuotvbd000n8udbw4r2i8em	Track 13			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d058a23cdd_1780286858.mp3	0	0	t	2026-06-01 04:07:38.185	2026-06-01 04:07:38.185
cmpuotw7x000o8udbr44son0o	Track 14			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d058b4f0e8_1780286859.mp3	0	0	t	2026-06-01 04:07:39.357	2026-06-01 04:07:39.357
cmpuotx6h000p8udbnxvqhekl	Track 15			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d058c89f11_1780286860.mp3	0	0	t	2026-06-01 04:07:40.601	2026-06-01 04:07:40.601
cmpuoty5f000q8udbs0bsrwgm	Track 16			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d058dc9a18_1780286861.mp3	0	0	t	2026-06-01 04:07:41.86	2026-06-01 04:07:41.86
cmpuotz3t000r8udb4r34oprk	Track 17			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d058f0f2c6_1780286863.mp3	0	0	t	2026-06-01 04:07:43.098	2026-06-01 04:07:43.098
cmpuotzzr000s8udbfy1l1z13	Track 18			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d059034c9b_1780286864.mp3	0	0	t	2026-06-01 04:07:44.247	2026-06-01 04:07:44.247
cmpuou0y1000t8udbwombyzql	Track 19			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05916cfab_1780286865.mp3	0	0	t	2026-06-01 04:07:45.481	2026-06-01 04:07:45.481
cmpuou1xo000u8udbl9xjkaaa	Track 20			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0592b1e66_1780286866.mp3	0	0	t	2026-06-01 04:07:46.764	2026-06-01 04:07:46.764
cmpuou2wj000v8udbiw0r7f82	Track 21			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0593efe2e_1780286867.mp3	0	0	t	2026-06-01 04:07:48.019	2026-06-01 04:07:48.019
cmpuou3ss000w8udb0pqfn5cw	Track 22			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05952470f_1780286869.mp3	0	0	t	2026-06-01 04:07:49.18	2026-06-01 04:07:49.18
cmpuou4rr000x8udbk2itcy3f	Track 23			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05966351e_1780286870.mp3	0	0	t	2026-06-01 04:07:50.439	2026-06-01 04:07:50.439
cmpuou5qj000y8udbyntl8o7h	Track 24			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0597a0471_1780286871.mp3	0	0	t	2026-06-01 04:07:51.691	2026-06-01 04:07:51.691
cmpuou6ps000z8udbcmwoe31f	Track 25			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d0598e2783_1780286872.mp3	0	0	t	2026-06-01 04:07:52.96	2026-06-01 04:07:52.96
cmpuou7m600108udb727g9gt5	Track 26			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d059a16517_1780286874.mp3	0	0	t	2026-06-01 04:07:54.126	2026-06-01 04:07:54.126
cmpuou8ks00118udb5j0u15yh	Track 27			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d059b52f30_1780286875.mp3	0	0	t	2026-06-01 04:07:55.372	2026-06-01 04:07:55.372
cmpuou9jj00128udbmilml7eh	Track 28			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d059c8faa1_1780286876.mp3	0	0	t	2026-06-01 04:07:56.623	2026-06-01 04:07:56.623
cmpuouain00138udbjx136z5n	Track 29			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d059dcef65_1780286877.mp3	0	0	t	2026-06-01 04:07:57.888	2026-06-01 04:07:57.888
cmpuoubf800148udbhmax4hfj	Track 30			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d059f06f6d_1780286879.mp3	0	0	t	2026-06-01 04:07:59.06	2026-06-01 04:07:59.06
cmpuoucdy00158udbmob5k3ce	Track 31			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05a0434b8_1780286880.mp3	0	0	t	2026-06-01 04:08:00.311	2026-06-01 04:08:00.311
cmpuoudcm00168udbmtj7hvh2	Track 32			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05a18069e_1780286881.mp3	0	0	t	2026-06-01 04:08:01.558	2026-06-01 04:08:01.558
cmpuouebg00178udbugf78ugx	Track 33			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05a2be369_1780286882.mp3	0	0	t	2026-06-01 04:08:02.813	2026-06-01 04:08:02.813
cmpuoufmv00188udbz5ftzhib	Track 34			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05a477251_1780286884.mp3	0	0	t	2026-06-01 04:08:04.519	2026-06-01 04:08:04.519
cmpuouhao00198udblnqu19e8	Track 35			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05a69b4b3_1780286886.mp3	0	0	t	2026-06-01 04:08:06.673	2026-06-01 04:08:06.673
cmpuouita001a8udbaopoh33o	Track 36			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05a893e0a_1780286888.mp3	0	0	t	2026-06-01 04:08:08.638	2026-06-01 04:08:08.638
cmpuoukev001b8udb17fxdcsw	Track 37			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05aaa526d_1780286890.mp3	0	0	t	2026-06-01 04:08:10.712	2026-06-01 04:08:10.712
cmpuoultf001c8udbb0nw4hhr	Track 38			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05ac7a121_1780286892.mp3	0	0	t	2026-06-01 04:08:12.531	2026-06-01 04:08:12.531
cmpuounhw001d8udb1xta4t31	Track 39			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05aea3db9_1780286894.mp3	0	0	t	2026-06-01 04:08:14.709	2026-06-01 04:08:14.709
cmpuouox5001e8udb7tosyapb	Track 40			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05b07f2be_1780286896.mp3	0	0	t	2026-06-01 04:08:16.554	2026-06-01 04:08:16.554
cmpuouqjf001f8udblc2t7gg7	Track 41			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05b29611a_1780286898.mp3	0	0	t	2026-06-01 04:08:18.651	2026-06-01 04:08:18.651
cmpuourz9001g8udbrxdqqz1c	Track 42			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05b47661d_1780286900.mp3	0	0	t	2026-06-01 04:08:20.517	2026-06-01 04:08:20.517
cmpuouton001h8udbztt00wgv	Track 43			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05b6a8cb5_1780286902.mp3	0	0	t	2026-06-01 04:08:22.727	2026-06-01 04:08:22.727
cmpuouv32001i8udbp3ywkbbl	Track 44			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05b87cd6b_1780286904.mp3	0	0	t	2026-06-01 04:08:24.543	2026-06-01 04:08:24.543
cmpuouwqu001j8udbz4rbv03k	Track 45			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05baa18ef_1780286906.mp3	0	0	t	2026-06-01 04:08:26.694	2026-06-01 04:08:26.694
cmonnudrc0000l704gwi34hq1	institucional	trilha para recados		institucional	/audios/track/69f552a4503a7_1777685156.mp3	0	0	t	2026-05-02 01:25:56.792	2026-05-07 20:48:38.973
cmonnvuxj0001l704g14s930t	institucional	trilha apra comunicados		institucional	/audios/track/69f552e973619_1777685225.mp3	0	0	t	2026-05-02 01:27:05.703	2026-05-07 20:48:54.372
cmonnyfzu0000jx046og2vrm1	Institucional	trilha para spot		institucional	/audios/track/69f5536212469_1777685346.mp3	0	0	t	2026-05-02 01:29:06.314	2026-05-07 20:49:01.052
cmoxterm10000jv04rj7ixiso	Beast Mode - The Soundings			IMPACTANTES	/audios/track/69feb11f834a5_1778299167.mp3	0	0	t	2026-05-09 03:59:27.817	2026-05-09 03:59:27.817
cmoxtes0n0001jv04gmxbfr2f	Broken Promise - Jimena Contreras			IMPACTANTES	/audios/track/69feb120150d7_1778299168.mp3	0	0	t	2026-05-09 03:59:28.344	2026-05-09 03:59:28.344
cmoxtex4g0002jv04dxe3ofrt	Black Thorns - Jimena Contreras			IMPACTANTES	/audios/track/69feb12694965_1778299174.mp3	0	0	t	2026-05-09 03:59:34.846	2026-05-09 03:59:34.846
cmoxtexlc0003jv048340wnra	Can_t Be Beat - The Soundings			IMPACTANTES	/audios/track/69feb126a0b3d_1778299174.mp3	0	0	t	2026-05-09 03:59:34.88	2026-05-09 03:59:34.88
cmoxtexqs0004jv04tp1znvuw	Curse of the Witches - Jimena Contreras			IMPACTANTES	/audios/track/69feb12786e4d_1778299175.mp3	0	0	t	2026-05-09 03:59:35.764	2026-05-09 03:59:35.764
cmoxtf0mw0005jv04394m1k6r	Cyberpunk Fury - Jimena Contreras			IMPACTANTES	/audios/track/69feb12b44253_1778299179.mp3	0	0	t	2026-05-09 03:59:39.513	2026-05-09 03:59:39.513
cmoxtf0ua0006jv049fq95bip	Dark Elves - Jimena Contreras			IMPACTANTES	/audios/track/69feb12b896b6_1778299179.mp3	0	0	t	2026-05-09 03:59:39.779	2026-05-09 03:59:39.779
cmoxtf0zd0007jv04894w2vzn	Deep Space Sector 9 - Ezra Lipp			IMPACTANTES	/audios/track/69feb12bac6e7_1778299179.mp3	0	0	t	2026-05-09 03:59:39.961	2026-05-09 03:59:39.961
cmoxtf3aj0008jv04z3lo30p3	Duty Calls - Rod Kim			IMPACTANTES	/audios/track/69feb12ea5859_1778299182.mp3	0	0	t	2026-05-09 03:59:42.956	2026-05-09 03:59:42.956
cmoxtf3nq0009jv04em2jl9ss	Epic Battle Speech - Wayne Jones			IMPACTANTES	/audios/track/69feb12f32ff0_1778299183.mp3	0	0	t	2026-05-09 03:59:43.43	2026-05-09 03:59:43.43
cmoxtf47o000ajv04dvsidh1y	Final Boss - Myuu			IMPACTANTES	/audios/track/69feb12fdc12b_1778299183.mp3	0	0	t	2026-05-09 03:59:44.148	2026-05-09 03:59:44.148
cmpuouy6a001k8udb2aj7omac	Track 46			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05bc7cd5f_1780286908.mp3	0	0	t	2026-06-01 04:08:28.547	2026-06-01 04:08:28.547
cmpuouzu6001l8udbtb4e5l2k	Track 47			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05bea3de6_1780286910.mp3	0	0	t	2026-06-01 04:08:30.702	2026-06-01 04:08:30.702
cmpuov18x001m8udb2gq9pz7j	Track 48			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05c078f29_1780286912.mp3	0	0	t	2026-06-01 04:08:32.529	2026-06-01 04:08:32.529
cmpuov2wr001n8udbupkaaxk8	Track 49			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05c29f4fd_1780286914.mp3	0	0	t	2026-06-01 04:08:34.684	2026-06-01 04:08:34.684
cmpuov4c7001o8udbq5h4fd43	Track 50			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05c47a580_1780286916.mp3	0	0	t	2026-06-01 04:08:36.536	2026-06-01 04:08:36.536
cmpuov600001p8udb8pt27k6r	Track 51			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05c6a04d7_1780286918.mp3	0	0	t	2026-06-01 04:08:38.688	2026-06-01 04:08:38.688
cmpuov7ey001q8udb6pvfl64t	Track 52			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05c878409_1780286920.mp3	0	0	t	2026-06-01 04:08:40.522	2026-06-01 04:08:40.522
cmpuov90q001r8udbj6a3tpf2	Track 53			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05ca8b639_1780286922.mp3	0	0	t	2026-06-01 04:08:42.602	2026-06-01 04:08:42.602
cmpuovaib001s8udbokrrjnif	Track 54			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05cc7a680_1780286924.mp3	0	0	t	2026-06-01 04:08:44.532	2026-06-01 04:08:44.532
cmpuovc5g001t8udboc9spief	Track 55			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05ce99945_1780286926.mp3	0	0	t	2026-06-01 04:08:46.66	2026-06-01 04:08:46.66
cmpuovdlf001u8udbu86kve4u	Track 56			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05d079bdd_1780286928.mp3	0	0	t	2026-06-01 04:08:48.531	2026-06-01 04:08:48.531
cmpuovf8d001v8udbhtnctz3j	Track 57			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05d29790f_1780286930.mp3	0	0	t	2026-06-01 04:08:50.654	2026-06-01 04:08:50.654
cmpuovgpw001w8udb69i215l6	Track 58			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05d486077_1780286932.mp3	0	0	t	2026-06-01 04:08:52.58	2026-06-01 04:08:52.58
cmpuovibi001x8udb5cickkkx	Track 59			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05d69780c_1780286934.mp3	0	0	t	2026-06-01 04:08:54.654	2026-06-01 04:08:54.654
cmpuovjr2001y8udbsxosy1hx	Track 60			trilhas agitadas	https://api.cvmnews.com.br/audios/track/6a1d05d874faf_1780286936.mp3	0	0	t	2026-06-01 04:08:56.51	2026-06-01 04:08:56.51
cmpupwtqw00278udb2vzmx6b8	IGREJA (1)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0ca3acd9f_1780288675.mp3	0	0	t	2026-06-01 04:37:55.736	2026-06-01 04:37:55.736
cmpupwxes00288udbj6wpcv7l	IGREJA (2)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0ca86fb17_1780288680.mp3	0	0	t	2026-06-01 04:38:00.484	2026-06-01 04:38:00.484
cmpupx16300298udbxaqn2d2z	IGREJA (3)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0cad4f00f_1780288685.mp3	0	0	t	2026-06-01 04:38:05.355	2026-06-01 04:38:05.355
cmpupxa2q002a8udbxmzefcfx	IGREJA (4)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0cb8d3b8c_1780288696.mp3	0	0	t	2026-06-01 04:38:16.899	2026-06-01 04:38:16.899
cmpupxj3r002b8udb41t8ar8k	IGREJA (5)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0cc48aee8_1780288708.mp3	0	0	t	2026-06-01 04:38:28.6	2026-06-01 04:38:28.6
cmpupxs0y002c8udbs9eh35dm	IGREJA (6)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0cd01ffd9_1780288720.mp3	0	0	t	2026-06-01 04:38:40.162	2026-06-01 04:38:40.162
cmpupy1lp002d8udbmrfezunh	IGREJA (7)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0cdc84d96_1780288732.mp3	0	0	t	2026-06-01 04:38:52.574	2026-06-01 04:38:52.574
cmpupyasz002e8udbxrwcasoa	IGREJA (8)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0ce871981_1780288744.mp3	0	0	t	2026-06-01 04:39:04.499	2026-06-01 04:39:04.499
cmpupyle9002f8udb3dj2cgns	IGREJA (9)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0cf62f976_1780288758.mp3	0	0	t	2026-06-01 04:39:18.225	2026-06-01 04:39:18.225
cmpupyvke002g8udb04xc7rkj	IGREJA (10)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0d035c2da_1780288771.mp3	0	0	t	2026-06-01 04:39:31.407	2026-06-01 04:39:31.407
cmpupz6bg002h8udbje2mx16f	IGREJA (11)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0d114c2fc_1780288785.mp3	0	0	t	2026-06-01 04:39:45.341	2026-06-01 04:39:45.341
cmpupzgr7002i8udbf98dmlso	IGREJA (12)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0d1ecd20a_1780288798.mp3	0	0	t	2026-06-01 04:39:58.868	2026-06-01 04:39:58.868
cmpupzkj8002j8udb4ezi9pxn	IGREJA (13)			IGREJA	https://api.cvmnews.com.br/audios/track/6a1d0d23b401d_1780288803.mp3	0	0	t	2026-06-01 04:40:03.764	2026-06-01 04:40:03.764
cmoym0adh0000l8047ioeq6q2	SEXY (1)			SEXY	/audios/track/69ff6cc0b67e4_1778347200.mp3	0	0	t	2026-05-09 17:20:01.043	2026-05-09 17:20:01.043
cmoyqi40d0002jo04wtwt0sck	BOSSA (3)			BOSSA	/audios/track/69ff8a3eeb8dc_1778354750.mp3	0	0	t	2026-05-09 19:25:51.181	2026-05-09 19:25:51.181
cmoyqibm80003jo04cff0scwc	BOSSA (4)			BOSSA	/audios/track/69ff8a48a9b00_1778354760.mp3	0	0	t	2026-05-09 19:26:00.928	2026-05-09 19:26:00.928
cmoyqiewn0004jo04gj2jubdi	BOSSA (5)			BOSSA	/audios/track/69ff8a4d1454a_1778354765.mp3	0	0	t	2026-05-09 19:26:05.304	2026-05-09 19:26:05.304
cmoyqihxi0005jo04anuy26o7	BOSSA (6)			BOSSA	/audios/track/69ff8a50f40bb_1778354768.mp3	0	0	t	2026-05-09 19:26:09.223	2026-05-09 19:26:09.223
cmoyqio3f0006jo04nw7vn5bn	BOSSA (7)			BOSSA	/audios/track/69ff8a58d28bc_1778354776.mp3	0	0	t	2026-05-09 19:26:17.099	2026-05-09 19:26:17.099
cmoyqivrp0007jo04xyo0pqzr	BOSSA (8)			BOSSA	/audios/track/69ff8a62dedae_1778354786.mp3	0	0	t	2026-05-09 19:26:27.158	2026-05-09 19:26:27.158
cmoyqj35y0008jo04vp1vmfw4	BOSSA (9)			BOSSA	/audios/track/69ff8a6c5a18e_1778354796.mp3	0	0	t	2026-05-09 19:26:36.629	2026-05-09 19:26:36.629
cmoyqj9de0009jo0489urw3iq	BOSSA (10)			BOSSA	/audios/track/69ff8a7482e8e_1778354804.mp3	0	0	t	2026-05-09 19:26:44.787	2026-05-09 19:26:44.787
cmoyqjg0f000ajo049fdak5ju	BOSSA (11)			BOSSA	/audios/track/69ff8a7d0e82b_1778354813.mp3	0	0	t	2026-05-09 19:26:53.278	2026-05-09 19:26:53.278
cmoyqk882000bjo04kvsybcr4	BOSSA (15)			BOSSA	/audios/track/69ff8aa1970d2_1778354849.mp3	0	0	t	2026-05-09 19:27:29.841	2026-05-09 19:27:29.841
cmoyqke8i000cjo04mpavstgo	BOSSA (16)			BOSSA	/audios/track/69ff8aa98114e_1778354857.mp3	0	0	t	2026-05-09 19:27:37.747	2026-05-09 19:27:37.747
cmoyqkkkb000djo04zgtssviw	BOSSA (17)			BOSSA	/audios/track/69ff8ab1908a7_1778354865.mp3	0	0	t	2026-05-09 19:27:45.835	2026-05-09 19:27:45.835
cmoyql0vs000ejo04b98hlaef	BOSSA (19)			BOSSA	/audios/track/69ff8ac6b64cf_1778354886.mp3	0	0	t	2026-05-09 19:28:06.984	2026-05-09 19:28:06.984
cmoyql733000fjo04ncyqva5e	BOSSA (20)			BOSSA	/audios/track/69ff8acedaf9c_1778354894.mp3	0	0	t	2026-05-09 19:28:15.136	2026-05-09 19:28:15.136
cmoyqld8z000gjo042q520jau	BOSSA (21)			BOSSA	/audios/track/69ff8ad6bb24f_1778354902.mp3	0	0	t	2026-05-09 19:28:23.01	2026-05-09 19:28:23.01
cmoyqljed000hjo04hc6rbq1e	BOSSA (22)			BOSSA	/audios/track/69ff8aded46ed_1778354910.mp3	0	0	t	2026-05-09 19:28:31.093	2026-05-09 19:28:31.093
cmoyqlwor000ijo04jiztq0us	BOSSA (24)			BOSSA	/audios/track/69ff8aefef4bc_1778354927.mp3	0	0	t	2026-05-09 19:28:48.203	2026-05-09 19:28:48.203
cmoyqlzqe000jjo04levqk66y	BOSSA (25)			BOSSA	/audios/track/69ff8af40a8e8_1778354932.mp3	0	0	t	2026-05-09 19:28:52.262	2026-05-09 19:28:52.262
cmoyqm5rd000kjo04ki5uq94l	BOSSA (26)			BOSSA	/audios/track/69ff8afbce32e_1778354939.mp3	0	0	t	2026-05-09 19:29:00.073	2026-05-09 19:29:00.073
cmoyqmfi5000mjo04ws7na9pp	BOSSA (28)			BOSSA	/audios/track/69ff8b086aab8_1778354952.mp3	0	0	t	2026-05-09 19:29:12.701	2026-05-09 19:29:12.701
cmoyqmicn000njo04j6joll0j	BOSSA (29)			BOSSA	/audios/track/69ff8b0c25c08_1778354956.mp3	0	0	t	2026-05-09 19:29:16.391	2026-05-09 19:29:16.391
cmoyqmta8000ojo04w0inlb22	BOSSA (30)			BOSSA	/audios/track/69ff8b1997258_1778354969.mp3	0	0	t	2026-05-09 19:29:29.84	2026-05-09 19:29:29.84
cmoyqn4di000pjo04xu10zkl0	BOSSA (31)			BOSSA	/audios/track/69ff8b28ab860_1778354984.mp3	0	0	t	2026-05-09 19:29:44.935	2026-05-09 19:29:44.935
cmoyqnfks0000l704qh6edxaj	BOSSA (32)			BOSSA	/audios/track/69ff8b367ef18_1778354998.mp3	0	0	t	2026-05-09 19:29:58.744	2026-05-09 19:29:58.744
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."User" (id, name, email, password, role, active, "googleId", "freeDownloads", "paymentExempt", "createdAt", "updatedAt") FROM stdin;
cmplof4dd0000l504byohmh61	frequencia Maxima	frequenciamaximaa@gmail.com		user	t	110000134522780195093	5	t	2026-05-25 20:46:14.498	2026-05-26 01:51:25.747
cmplnkvu90000l204lqgf6kw4	Jose Vanderlei Toledo	toledojosevanderlei80@gmail.com		user	t	112968279963599180618	5	t	2026-05-25 20:22:43.762	2026-05-28 17:55:25.537
cmplzhonw0000jl04d4s86byx	André andrade	radioinovecacador@gmail.com	339e2355a8088e95ad419fd026cc9033e1219e7746b6f1bd4216a5482ffb9edb	user	t	117583253087859161567	5	t	2026-05-26 01:56:09.885	2026-05-30 12:32:03.736
cmplln2dv0000jy04c6kicu46	Administrador	contatorgdweb@gmail.com	d3311cc13f877135e1d541687c2ffaa1283de6d98adaf1791277c297c1ea8baa	admin	t	106899273964017244810	0	t	2026-05-25 19:28:26.323	2026-06-04 14:23:48.163
\.


--
-- Data for Name: Voice; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."Voice" (id, name, description, gender, age, accent, pitch, "previewUrl", "order", active, "createdAt", "updatedAt", category) FROM stdin;
cmp8op6bz000il704tvgy12s2	Voz suave para falar grave	Voz Voz suave para falar grave	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:03.312	2026-05-16 18:33:03.312	Graves
cmp8oq023000il804hb2411d5	Flávio	Voz Flávio	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:41.835	2026-05-30 12:34:08.844	Narradores
cmosp9cut0000l704i66vz15t	Voz muito grave para festa		Auto	Auto	Auto	Auto		0	t	2026-05-05 14:04:25.953	2026-05-07 20:47:27.51	Graves
cmp8m7my90000i904xsk41d6h	Julio pedra		Auto	Auto	Auto	Auto		0	t	2026-05-16 17:23:25.809	2026-05-16 17:23:25.809	Graves
cmp8orn9l0026l804jcj7hpvi	voz nova locutor caitá	Voz voz nova locutor caitá	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:58.569	2026-06-02 02:28:23.795	Graves
cmp8opgdk0003l8042wgsza42	Celso	Voz Celso	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:16.329	2026-06-02 02:30:12.142	Graves
cmp8opi9q0006l8048zw7vokb	Emerson (1)	Voz Emerson (1)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:18.782	2026-06-02 02:31:22.08	Graves
cmoyqqvq70000jr04n6mp46pf	Infantil	vozes infantis	Auto	Auto	Auto	Auto		0	t	2026-05-09 19:32:40.236	2026-05-09 19:32:40.236	Infantil
cmp8oqe0g000rl804jl0ld740	Márcio Henrique (1)	Voz Márcio Henrique (1)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:59.921	2026-05-30 12:34:21.474	Graves
cmp8opns90009l804ufob218v	Emerson C Impacto (hearthis.at)	Voz Emerson C Impacto (hearthis.at)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:25.93	2026-05-16 18:33:25.93	Super Graves
cmp8or8zz001ll804rdmbp7xt	locutor de radio	Voz locutor de radio	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:40.08	2026-05-16 18:34:40.08	Vinheta
cmoxp2op50000l404arl6znqd	Caio cezar	Voz para propagandas narradas	Auto	Auto	Auto	Auto		0	t	2026-05-09 01:58:04.23	2026-05-30 12:38:58.138	Vozes Famosas
cmoyrc3qr0000ju04olt82yt0	Érika Silva		Auto	Auto	Auto	Auto		0	t	2026-05-09 19:49:09.814	2026-05-30 12:39:11.223	Feminina
cmoz6cqnm000fjr04eb63zb5s	LUD puntel	Voz LUD puntel	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:34.45	2026-05-30 12:39:17.976	Feminina
cmoz6cyca0003l504lvi4x7w5	priscila loc	Voz priscila loc	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:44.411	2026-05-30 12:39:28.82	Feminina
cmoz6d04y0006l504jjfi8ad0	Sula	Voz Sula	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:46.739	2026-05-30 12:39:38.214	Feminina
cmp8op0xt0009l704sz9fbgkm	voz 2 fala	Voz voz 2 fala	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:32:56.321	2026-05-30 12:39:53.924	Narradores
cmon7st5x0000jy04h57scoii	Waldo	Voz Grave para festas	Auto	Auto	Auto	Auto		0	t	2026-05-01 17:56:49.697	2026-05-26 20:04:48.877	Super Graves
cmp8orly00023l8041ubn9p1u	voz 3 fala	Voz voz 3 fala	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:56.856	2026-05-30 12:40:09.026	Festas
cmoz0wgs30000jp0478q5dnar	Mercado		Auto	Auto	Auto	Auto		0	t	2026-05-10 00:16:57.071	2026-05-30 12:32:16.383	Mercado
cmon2qtnh0000l104j1obzdg7	André Andrade	Voz para igrejas	Auto	Auto	Auto	Auto		0	t	2026-05-01 15:35:18.826	2026-05-30 12:32:27.201	Mercado
cmoso2i1t0000l4041iv52fe8	Marcos Brasil	ROdeio	Auto	Auto	Auto	Auto		0	t	2026-05-05 13:31:06.48	2026-05-30 12:32:49.789	Narradores
cmoyrg9vp0000jv04fahfxyge	Felipe	Voz grave festas	Auto	Auto	Auto	Auto		0	t	2026-05-09 19:52:24.979	2026-05-30 12:33:35.879	Graves
cmpj8h7uw0000l4049ps7x03f	Suélen Hermes	Voz Suélen Hermes	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:44:26.12	2026-05-30 12:57:02.156	Feminina
cmp8oouol0000l7047pfzai6j	Locutor 1	Voz Locutor 1	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:32:48.213	2026-05-30 13:02:50.957	Graves
cmp8oowtw0003l704zwmrd6qb	locutor 2	Voz locutor 2	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:32:50.996	2026-05-30 13:02:59.872	Graves
cmp8orh11001xl8042nq9pult	rogerio dultra	Voz rogerio dultra	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:50.485	2026-05-30 13:03:12.671	Festas
cmoz6cifr0000jr0416215kan	Cassiane	Voz Cassiane	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:23.799	2026-05-30 13:04:02.516	Feminina
cmoz6cki40003jr048a9tni7n	Dia das maes ANA	Voz Dia das maes ANA	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:26.477	2026-05-30 13:04:11.84	Feminina
cmoz6cnnp0009jr049kbejvcg	Jacile (1)	Voz Jacile (1)	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:30.565	2026-05-30 13:04:17.073	Feminina
cmp8oqkzm000xl804tsxkit7i	O DJ ESPECIALISTA EM FAZER O POVÃO CURTIR	Voz O DJ ESPECIALISTA EM FAZER O POVÃO CURTIR	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:08.963	2026-05-16 18:34:08.963	Festas
cmp8op401000fl704xrt6juaq	Voz para festa	Voz Voz para festa	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:00.29	2026-05-16 18:33:00.29	Festas
cmp8or6ze001il8049beryjlk	locução grave	Voz locução grave	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:37.467	2026-05-16 18:34:37.467	Graves
cmp8oqbx1000ol8041c1r2i0f	Kavanhac Impacto.mp3 (hearthis.at)	Voz Kavanhac Impacto.mp3 (hearthis.at)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:33:57.205	2026-05-16 18:33:57.205	Super Graves
cmp8oqq1i0010l8046pr6y532	Renato Impacto.mp3 (hearthis.at)	Voz Renato Impacto.mp3 (hearthis.at)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:15.51	2026-05-16 18:34:15.51	Super Graves
cmp8or33l001cl804nbk49yv6	Freire Impacto (hearthis.at)	Voz Freire Impacto (hearthis.at)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:32.434	2026-05-16 18:34:32.434	Super Graves
cmp8or557001fl804jhaiqg3v	Jean P Impacto (hearthis.at)	Voz Jean P Impacto (hearthis.at)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:35.083	2026-05-16 18:34:35.083	Super Graves
cmp8orasq001ol804l333hhuc	locutor impacto 1	Voz locutor impacto 1	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:42.41	2026-05-16 18:34:42.41	Super Graves
cmp8orjct0020l804hljmh5yr	Tauema Impacto.mp3 (hearthis.at)	Voz Tauema Impacto.mp3 (hearthis.at)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:53.502	2026-05-16 18:34:53.502	Super Graves
cmpj8hws00006k404lxezsrmm	MAXIMO	Voz MAXIMO	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:44:58.417	2026-05-24 03:44:58.417	Super Graves
cmpj8i0v7000fk404p8q8m2tx	dutra	Voz dutra	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:45:03.715	2026-05-30 12:37:57.997	Graves
cmpj8jeph000lk404lnpmbbel	Juninho Carlos	Voz Juninho Carlos	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:46:08.309	2026-05-30 12:38:05.484	Narradores
cmpj8ji1w000rk404ed7634tp	Voz 03	Voz 0428485001770293697	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:46:12.644	2026-05-30 12:59:36.759	Narradores
cmpj8jl2o000xk404wc94umd2	NOEL LUCAS	Voz NOEL LUCAS	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:46:16.561	2026-05-30 12:59:54.344	Vinheta
cmpj8i30m000ik404za9651jp	Voz 01	Voz 0428485001770293697 (1)	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:45:06.387	2026-05-30 13:00:17.606	Narradores
cmpj8jgki000ok404f9wkdmjp	Voz 02	Voz 0942720001554330189	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:46:10.722	2026-05-30 13:02:09.411	Vendas
cmpj8jnze0013k404anzpzesq	Tito Maciel	Voz Tito Maciel	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:46:20.33	2026-06-02 02:29:16.428	Graves
cmp8oqg7l000ul8040rpthpdg	Márcio Henrique	Voz Márcio Henrique	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:02.769	2026-06-02 02:31:40.394	Graves
cmoz6cm490006jr04ixr0unlu	Géssica Sousa	Voz Géssica Sousa	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:28.57	2026-05-26 02:23:19.876	Feminina
cmoz6cp15000cjr04zgs0pa2n	Loc Lindi	Voz Loc Lindi	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:32.346	2026-05-26 02:23:35.133	Feminina
cmoz6csxk000ijr04jse8fc4s	Nana	Voz Nana	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:37.289	2026-05-26 02:23:45.971	Feminina
cmoz6cwy20000l5048iocis6z	Paty	Voz Paty	Auto	Auto	Auto	Auto		0	t	2026-05-10 02:49:42.602	2026-05-26 02:23:56.473	Feminina
cmp8ooyto0006l704o9za0sgr	valter zanetti	Voz valter zanetti	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:32:53.581	2026-05-30 12:35:06.539	Graves
cmpj1uuuv0000ky04y829ikvv	Carol Pedroso		Auto	Auto	Auto	Auto		0	t	2026-05-24 00:39:05.143	2026-05-26 02:24:33.91	Feminina
cmpj8h9qi0003l404q0ade6k9	sabrina	Voz sabrina	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:44:28.555	2026-05-28 11:20:34.005	Feminina
cmp8mdyno0000la041eu40xry	Valdir Melo		Auto	Auto	Auto	Auto		0	t	2026-05-16 17:28:20.917	2026-05-30 12:34:37.073	Festas
cmp8oqwi90013l804f0o7qhi4	rhanierylocutor	Voz rhanierylocutor	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:23.89	2026-05-30 12:35:18.998	Graves
cmp8oqyox0016l804nttzbnns	sergio neves	Voz sergio neves	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:26.721	2026-05-30 12:35:31.507	Vendas
cmp8or10r0019l804ypqffsn6	Fernando Carvalho.mp3 (hearthis.at)	Voz Fernando Carvalho.mp3 (hearthis.at)	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:29.628	2026-05-30 12:35:39.411	Graves
cmp8ord2h001rl804cnijad48	paulo carvalho 2	Voz paulo carvalho 2	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:45.241	2026-05-30 12:35:52.221	Graves
cmp8orf3r001ul804ryifsn6q	paulo carvalho	Voz paulo carvalho	Auto	Auto	Auto	Auto		0	t	2026-05-16 18:34:47.992	2026-05-30 12:35:59.153	Graves
cmpj8hsk90000k404md348pke	dutra 2	Voz dutra 2	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:44:52.954	2026-05-30 12:36:06.406	Graves
cmpj8hv1h0003k40401h85xss	Institucional Celso	Voz Institucional Celso	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:44:56.165	2026-05-30 12:37:47.767	Narradores
cmpj8jja7000uk404etcfyoy5	Vanderley	Voz Vanderley	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:46:14.239	2026-05-30 12:38:13.555	Narradores
cmpj8hy890009k404m2rcfqsq	Bruninho Vox	Voz Bruninho Vox	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:45:00.298	2026-05-30 12:57:13.487	Graves
cmpj8hzgl000ck404ay8htce5	trindade	Voz trindade	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:45:01.893	2026-05-30 12:57:21.967	Super Graves
cmpotb3x40000ju04wkiodl44	Aline Dias		Auto	Auto	Auto	Auto		0	t	2026-05-28 01:26:23.897	2026-05-28 10:20:13.596	Feminina
cmpj8jmeq0010k404bu4ge4ph	Antonio Manoel	Voz Antonio Manoel	Auto	Auto	Auto	Auto		0	t	2026-05-24 03:46:18.291	2026-05-30 13:02:25.612	Mercado
cmpu6ptc700038ujrx3vfq9qu	voz marcio	Voz voz marcio	Auto	Auto	Auto	Auto		0	t	2026-05-31 19:40:35.911	2026-05-31 19:40:35.911	Mercado
\.


--
-- Data for Name: VoiceVariation; Type: TABLE DATA; Schema: public; Owner: omnivoice
--

COPY public."VoiceVariation" (id, "voiceId", label, emoji, "refAudioPath", "refAudioServerUrl", "refAudioFilename", "refAudioName", "refText", instruct, "order", active, "createdAt", "updatedAt", "defaultSpeed") FROM stdin;
cmoz6cm7h0008jr042lavpo96	cmoz6cm490006jr04ixr0unlu	Padrão		https://api.cvmnews.com.br/audios/ref/6a21993b2af0e_1780586811.wav	https://api.cvmnews.com.br/audios/ref/6a21993b2af0e_1780586811.wav	6a21993b2af0e_1780586811.wav	69fff2386630b_1778381368.wav			0	t	2026-05-10 02:49:28.685	2026-06-04 15:26:51.213	1
cmoz6cim50002jr04tnc3jry1	cmoz6cifr0000jr0416215kan	Padrão		https://api.cvmnews.com.br/audios/ref/6a219a0777d27_1780587015.wav	https://api.cvmnews.com.br/audios/ref/6a219a0777d27_1780587015.wav	6a219a0777d27_1780587015.wav	Cassiane.wav			0	t	2026-05-10 02:49:24.03	2026-06-04 15:30:15.53	1
cmp8opggr0005l804sv70dogr	cmp8opgdk0003l8042wgsza42	Padrão		/tmp/gradio/3d89ce0ebd9400b8b0db2c4762302647d50b919db4a9983169c57cc66652d71b/Celso.wav	/audios/ref/6a1034f2120a3_1779447026.wav	6a1034f2120a3_1779447026.wav	Celso.wav			0	t	2026-05-16 18:33:16.443	2026-06-03 23:32:29.514	1
cmp8opicx0008l804fjzxjk7l	cmp8opi9q0006l8048zw7vokb	Padrão		/tmp/gradio/9b962a4986ed5ccdb7a025f476ead653aed5b2856beeb50e691da98b69ad9629/audio.wav	/audios/ref/6a10d2ae57f6e_1779487406.wav	6a10d2ae57f6e_1779487406.wav	audio.wav			0	t	2026-05-16 18:33:18.897	2026-06-03 23:32:29.514	1
cmp8opnvg000bl8045970s3iv	cmp8opns90009l804ufob218v	Padrão		https://api.cvmnews.com.br/audios/ref/6a1d8ffb8a203_1780322299.mp3	https://api.cvmnews.com.br/audios/ref/6a1d8ffb8a203_1780322299.mp3	6a1d8ffb8a203_1780322299.mp3	Emerson C Impacto (hearthis.at).mp3			0	t	2026-05-16 18:33:26.045	2026-06-03 23:32:29.514	1
cmp8oq05a000kl804h9dacxwl	cmp8oq023000il804hb2411d5	Padrão		/tmp/gradio/70a8ad3a1cb3348866dc23c5ee6d591b365aeab29df70c3133ddf9994be79eb9/audio.wav	/audios/ref/6a103025a09ce_1779445797.wav	6a103025a09ce_1779445797.wav	audio.wav			0	t	2026-05-16 18:33:41.95	2026-06-03 23:32:29.514	1
cmoyqrsoy0001jl04w7zcmtvn	cmoyqqvq70000jr04n6mp46pf	Bambini DUDY DANILO OFF (hearthis.at)		/tmp/gradio/def1373b69aafc25f70ee2b24c187899d8444bd01055542c99c5cb537673707c/Bambini DUDY DANILO OFF hearthis.at.wav	/audios/ref/6a07ebbeb65f3_1778903998.wav	6a07ebbeb65f3_1778903998.wav	Bambini DUDY DANILO OFF (hearthis.at).wav			0	t	2026-05-09 19:33:23.074	2026-06-03 14:27:30.139	1
cmospa29s0001kv04uadpr8zq	cmosp9cut0000l704i66vz15t	Muito Grave		/tmp/gradio/f5b28bb006cbae587d9c299262b4839250735e70dfac65359f52aaa264e01b3e/Locutor-impacto-do-brasil-2026-05-05-11-03-Não-é-só-mais-um-evento-É-o-tipo-de-noite-que.wav	/audios/ref/6a07eb87ecca9_1778903943.wav	6a07eb87ecca9_1778903943.wav	Locutor-impacto-do-brasil-2026-05-05-11-03-Não-é-só-mais-um-evento!!-É-o-tipo-de-noite-que.wav			0	t	2026-05-05 14:04:59.008	2026-06-03 23:32:29.514	1
cmoso8hcw0001jy04knzonmk3	cmoso2i1t0000l4041iv52fe8	Narração rodeio		/tmp/gradio/6e2afd7361b7d88acf6cc2128456e9d1f87b89aed33a863add74eb18496411c8/marcos brasil.mp3	/audios/ref/6a0f913ce4a6f_1779405116.mp3	6a0f913ce4a6f_1779405116.mp3	marcos brasil.mp3			0	t	2026-05-05 13:35:45.632	2026-05-21 23:11:57.773	1
cmoyqrvs10003jl04bckeus13	cmoyqqvq70000jr04n6mp46pf	YASMIN EDUANE ALIANDRA infantil		/tmp/gradio/dc6447fc3f5f74459bd04e224c7b000d857fc585739506cdf916ad51839d7cc3/YASMIN EDUANE ALIANDRA infantil.wav	/audios/ref/6a07ebdb9287c_1778904027.wav	6a07ebdb9287c_1778904027.wav	YASMIN EDUANE ALIANDRA infantil.wav			0	t	2026-05-09 19:33:27.073	2026-06-03 23:32:29.514	1
cmp8ooywx0008l70484ykr76b	cmp8ooyto0006l704o9za0sgr	Padrão		/tmp/gradio/8f178d15c1058a0dc9c7a8a6fe75d97007337168f98aa47ec4d362b3f18e2bf5/valter zanetti.wav	/audios/ref/6a08b855563f2_1778956373.wav	6a08b855563f2_1778956373.wav	valter zanetti.wav			0	t	2026-05-16 18:32:53.697	2026-06-03 14:27:35.978	1
cmp8oql2s000zl804sau9n2jb	cmp8oqkzm000xl804tsxkit7i	Padrão		/tmp/gradio/0581645e3f9d516213b8bf80eb431d570ebd772fc1fa179480bdceb80d5de445/O DJ ESPECIALISTA EM FAZER O POVÃO CURTIR.wav	/audios/ref/6a08b8a0c470d_1778956448.wav	6a08b8a0c470d_1778956448.wav	O DJ ESPECIALISTA EM FAZER O POVÃO CURTIR.wav			0	t	2026-05-16 18:34:09.077	2026-06-03 23:32:29.514	1
cmp8oowx50005l70454jxej7a	cmp8oowtw0003l704zwmrd6qb	Padrão		https://api.cvmnews.com.br/audios/ref/6a1f42c14943c_1780433601.wav	https://api.cvmnews.com.br/audios/ref/6a1f42c14943c_1780433601.wav	6a1f42c14943c_1780433601.wav	locutor 2.wav			0	t	2026-05-16 18:32:51.113	2026-06-03 14:27:35.68	1
cmp8oqysi0018l804muz09p5s	cmp8oqyox0016l804nttzbnns	Padrão		/tmp/gradio/fca3a66a31adf4840240901b519630a9cb33d9c03e284fc9accb6b310a18402b/sergio neves.wav	/audios/ref/6a08b8b27bcbc_1778956466.wav	6a08b8b27bcbc_1778956466.wav	sergio neves.wav			0	t	2026-05-16 18:34:26.85	2026-06-03 23:32:29.514	1
cmp8oqwlg0015l804kp3z4ul4	cmp8oqwi90013l804f0o7qhi4	Padrão		/tmp/gradio/28a77134727be8394cc4093f2da52fec0455470986019558caff48b6f038cac0/rhanierylocutor.wav	/audios/ref/6a08b8af9ea67_1778956463.wav	6a08b8af9ea67_1778956463.wav	rhanierylocutor.wav			0	t	2026-05-16 18:34:24.004	2026-06-03 14:27:38.662	1
cmp8or13y001bl804rgblwgbp	cmp8or10r0019l804ypqffsn6	Padrão		/tmp/gradio/11a40cba3ed1e083888c48fd8df1de92534c7ab0c798dcd891dc219d2ad3a20a/Fernando Carvalho.mp3 hearthis.at.wav	/audios/ref/6a08b8b55e453_1778956469.wav	6a08b8b55e453_1778956469.wav	Fernando Carvalho.mp3 (hearthis.at).wav			0	t	2026-05-16 18:34:29.854	2026-06-03 14:27:39.274	1
cmp8or58d001hl804crtzurd0	cmp8or557001fl804jhaiqg3v	Padrão		/tmp/gradio/97f0f698ad30f3bef97d658d57bf8addf03d488e5b5411afb391d888cdcfab83/Jean P Impacto hearthis.at.wav	/audios/ref/6a08b8bad0b4b_1778956474.wav	6a08b8bad0b4b_1778956474.wav	Jean P Impacto (hearthis.at).wav			0	t	2026-05-16 18:34:35.198	2026-06-03 14:27:39.572	1
cmp8or72k001kl804tyainqfv	cmp8or6ze001il8049beryjlk	Padrão		/tmp/gradio/cf46f7c344d6bd4a28c8ae07d7360a768b22aa15ff405a982c46017c8835487f/locução grave.wav	/audios/ref/6a08b8bd44204_1778956477.wav	6a08b8bd44204_1778956477.wav	locução grave.wav			0	t	2026-05-16 18:34:37.581	2026-06-03 14:27:39.859	1
cmoz6cyfj0005l5045fpfnv5u	cmoz6cyca0003l504lvi4x7w5	Padrão		/tmp/gradio/3a4070de5c1a64ced5e9572ad295c63747a19cf9f0d97cce2425ccf373a9ac9f/priscila loc.mp3	/audios/ref/6a074d00c4d9a_1778863360.mp3	6a074d00c4d9a_1778863360.mp3	priscila loc.mp3			0	t	2026-05-10 02:49:44.527	2026-05-15 16:42:41.466	1
cmpj8h81h0002l404vjqzd1mt	cmpj8h7uw0000l4049ps7x03f	Padrão		https://api.cvmnews.com.br/audios/ref/6a219cbb6ce69_1780587707.wav	https://api.cvmnews.com.br/audios/ref/6a219cbb6ce69_1780587707.wav	6a219cbb6ce69_1780587707.wav	Suélen Hermes.wav			0	t	2026-05-24 03:44:26.358	2026-06-04 15:41:47.481	1
cmpj1wrhk0001ji04mqu12v2k	cmpj1uuuv0000ky04y829ikvv	animada		https://api.cvmnews.com.br/audios/ref/6a21f6a0c99aa_1780610720.wav	https://api.cvmnews.com.br/audios/ref/6a21f6a0c99aa_1780610720.wav	6a21f6a0c99aa_1780610720.wav	WhatsApp Audio 2026-05-23 at 21.31.05.wav			0	t	2026-05-24 00:40:34.088	2026-06-04 22:05:20.863	1
cmp8op43a000hl704ebdzt796	cmp8op401000fl704xrt6juaq	Padrão		/tmp/gradio/b4eadfe366aea6a0c4cd8fd3e8241ea9c69e2988d1372909f1c80cdc1046aaab/Voz para festa.wav	https://api.cvmnews.com.br/audios/ref/6a1bbf67c6782_1780203367.wav	6a1bbf67c6782_1780203367.wav	Voz para festa.wav			0	t	2026-05-16 18:33:00.406	2026-06-03 14:27:36.266	1
cmpj8hybj000bk4045vfga9ii	cmpj8hy890009k404m2rcfqsq	Padrão		/tmp/gradio/eb65d3e8e5c25623dc40052ccbc7b84dabd7f2cf6712521bfea1ad730e383043/Bruninho Vox.wav	/audios/ref/6a1275847e91a_1779594628.wav	6a1275847e91a_1779594628.wav	Bruninho Vox.wav			0	t	2026-05-24 03:45:00.416	2026-06-03 14:27:42.892	1
cmpj8hv4q0005k404jy2b5ulq	cmpj8hv1h0003k40401h85xss	Padrão		/tmp/gradio/06ec2fce8734660bf522fa0483a0526a39d88a7969b990cf99788e1bec6fb156/Institucional-Celso.mp3	https://api.cvmnews.com.br/audios/ref/6a1ad9e3a2140_1780144611.wav	6a1ad9e3a2140_1780144611.wav	Institucional-Celso.wav			0	t	2026-05-24 03:44:56.282	2026-06-03 14:27:42.578	1
cmp8ord5v001tl804af114649	cmp8ord2h001rl804cnijad48	Padrão		/tmp/gradio/bbfaf1d729782def1227e49bd9c1c767398a13f187a20a290592fd8a626b7b26/paulo carvalho 2.wav	/audios/ref/6a08b8c50910b_1778956485.wav	6a08b8c50910b_1778956485.wav	paulo carvalho 2.wav			0	t	2026-05-16 18:34:45.475	2026-06-03 14:27:40.744	1
cmp8orh47001zl804o59pvgs4	cmp8orh11001xl8042nq9pult	Padrão		/tmp/gradio/bbfae78bfd6cd0d02390f365a098ec2f2120fde0c7801741706f8877d4147f9e/rogerio dultra.wav	https://api.cvmnews.com.br/audios/ref/6a1baecfb6254_1780199119.wav	6a1baecfb6254_1780199119.wav	rogerio dultra.wav			0	t	2026-05-16 18:34:50.599	2026-06-03 14:27:41.315	1
cmpj8hwva0008k404xu8k8quu	cmpj8hws00006k404lxezsrmm	Padrão		/tmp/gradio/5114d938c9db04b74cee91fc5bdb847c7472a476b42abf0b17424819e3df0eef/MAXIMO.mp3	/audios/ref/6a12743a43016_1779594298.mp3	6a12743a43016_1779594298.mp3	MAXIMO.mp3			0	t	2026-05-24 03:44:58.535	2026-06-03 23:32:29.514	1
cmpj8jmi00012k404lsnpzot8	cmpj8jmeq0010k404bu4ge4ph	Padrão		/tmp/gradio/551589d41b2f76dd8c14eb6dfbfada91eb97737b4e75259d75a15515171c49c8/Antonio Manoel.mp3	/audios/ref/6a12748a2897a_1779594378.mp3	6a12748a2897a_1779594378.mp3	Antonio Manoel.mp3			0	t	2026-05-24 03:46:18.408	2026-05-24 03:46:18.408	1
cmoz6d0870008l504hnje4ci2	cmoz6d04y0006l504jjfi8ad0	Padrão		/tmp/gradio/202ba29c4cb17c8410bb5bceab1b232736190ec9d71b109166173a6ec98be0fa/Sula.mp3	/audios/ref/6a074c7acd41a_1778863226.mp3	6a074c7acd41a_1778863226.mp3	Sula.mp3			0	t	2026-05-10 02:49:46.855	2026-05-15 16:40:27.434	1
cmp7agbzo0007l5044fzjlmp6	cmon7st5x0000jy04h57scoii	Voz Wilson 2		/tmp/gradio/f551c5b0d9af0c7f0a8255613b26c0a392a5498bd8f5de55b866f1afd97972fa/Voz Wilson 2.mp3	/audios/ref/6a076eb54f528_1778871989.mp3	6a076eb54f528_1778871989.mp3	Voz Wilson 2.mp3			0	t	2026-05-15 19:06:29.941	2026-05-15 19:06:29.941	1
cmp79yxqw0001ie045qbethmz	cmon7st5x0000jy04h57scoii	waldo		/tmp/gradio/8c6843e6be8d16e3dd5331b82a37f334cf6c873474e1b9d9e94ee1f8e456e055/waldo.wav	/audios/ref/6a0cb660e5f78_1779218016.wav	6a0cb660e5f78_1779218016.wav	waldo.wav			0	t	2026-05-15 18:52:58.328	2026-06-03 14:27:33.658	1
cmp7ag2x20001l504t90rfbez	cmon7st5x0000jy04h57scoii	Voz Wilson 5		/tmp/gradio/420d24c4c42882d0f4d9ed2537a381fd722aafc483b28acefb74bc455294a764/Voz Wilson 5.wav	/audios/ref/6a0cb640f36de_1779217984.wav	6a0cb640f36de_1779217984.wav	Voz Wilson 5.wav	No parque do grego, bond do forró, DJ Maluco..		0	t	2026-05-15 19:06:18.183	2026-06-03 14:27:33.925	1
cmp7ag5xc0003l504dyscwalv	cmon7st5x0000jy04h57scoii	Voz Wilson 4		/tmp/gradio/f773b0d4100814495762192a962712c5d86e0067d239e581644d0041f8131c91/Voz Wilson 4.wav	/audios/ref/6a0cb66fb7e9b_1779218031.wav	6a0cb66fb7e9b_1779218031.wav	Voz Wilson 4.wav			0	t	2026-05-15 19:06:22.08	2026-06-03 14:27:34.206	1
cmp7ageu10009l5048trdxzzn	cmon7st5x0000jy04h57scoii	Voz Wilson 1		/tmp/gradio/757a450ae3fd832b80c4ee8844464aa04dd03ab101a791f8b690c22f2946c117/Voz Wilson 1.wav	/audios/ref/6a08aed7ed7fa_1778953943.wav	6a08aed7ed7fa_1778953943.wav	Voz Wilson 1.wav			0	t	2026-05-15 19:06:33.626	2026-06-03 14:27:34.498	1
cmon4flkq0001l204fs8z304q	cmon2qtnh0000l104j1obzdg7	Animada		/tmp/gradio/99efa822164f0e5f393baabc3345436dbee9737a573b72c4196451ec87a935b1/voz andré normal.wav	/audios/ref/6a07ea36a6918_1778903606.wav	6a07ea36a6918_1778903606.wav	voz andré normal.wav			0	t	2026-05-01 16:22:34.49	2026-06-03 23:32:29.514	1
cmon7dgns0001lc041buysvfr	cmon2qtnh0000l104j1obzdg7	Grave		/tmp/gradio/c653e945f1a0b6d4bb2f41aefeac25baefb074e35ef753effcaf4c8b2f6e7edf/Voz andré grave.wav	/audios/ref/6a07ea05250d9_1778903557.wav	6a07ea05250d9_1778903557.wav	Voz andré grave.wav			0	t	2026-05-01 17:44:53.657	2026-06-03 23:32:29.514	1
cmp7ag8l60005l504ue1c58na	cmon7st5x0000jy04h57scoii	Voz Wilson 3		/tmp/gradio/ae42a805dbb9002ed3029abae134e36d5f707cc9622d0c3da68f457292c07cd4/Voz Wilson 3.mp3	/audios/ref/6a076eb0e73ba_1778871984.mp3	6a076eb0e73ba_1778871984.mp3	Voz Wilson 3.mp3			0	t	2026-05-15 19:06:25.531	2026-06-03 23:32:29.514	1
cmp8op6f9000kl704l482ex6j	cmp8op6bz000il704tvgy12s2	Padrão		https://api.cvmnews.com.br/audios/ref/6a1f2b41631af_1780427585.wav	https://api.cvmnews.com.br/audios/ref/6a1f2b41631af_1780427585.wav	6a1f2b41631af_1780427585.wav	Voz suave para falar grave.wav			0	t	2026-05-16 18:33:03.43	2026-06-03 23:32:29.514	1
cmpmoqvig0001l5048h1wh8p5	cmpj8hzgl000ck404ay8htce5	grave		/tmp/gradio/d67534acaef8062565337ec30b9047f0c534f90e7baf4e920ce0c0dce8dacc36/trindade.wav	http://147.15.77.137/audios/ref/6a15a3674b2ca_1779802983.wav	6a15a3674b2ca_1779802983.wav	trindade.wav			0	t	2026-05-26 13:43:09.065	2026-06-03 14:27:43.502	1
cmpyenvqz00018u5494u9wovc	cmpu6ptc700038ujrx3vfq9qu	voz marcio			https://api.cvmnews.com.br/audios/ref/6a20739e9c938_1780511646.mp3	6a20739e9c938_1780511646.mp3	voz marcio.mp3			0	t	2026-06-03 18:34:07.355	2026-06-03 23:32:29.514	1
cmpotjok30001jm04jtgu6kvy	cmpotb3x40000ju04wkiodl44	Locução Calma		/tmp/gradio/60a13e64c892076f583f8065179682c97e10194693517deb8b6e89312e03893f/WhatsApp Audio 2026-05-24 at 02.32.54.wav	https://api.cvmnews.com.br/audios/ref/6a179b4e3fc9d_1779931982.wav	6a179b4e3fc9d_1779931982.wav	WhatsApp Audio 2026-05-24 at 02.32.54.wav	qué coisa boa, saborosa e feita com muito carinho? então você precisa conhece a elô salgados e mini mercado, lá tem salgados deliciosos tudo fresquinho, feito com ingredientes de primeira com aquele tempero e especial que todo mundo gosta, e também é mini mercado.		0	t	2026-05-28 01:33:03.891	2026-06-03 23:32:29.514	1
cmp8oqc07000ql804gr4aqt7q	cmp8oqbx1000ol8041c1r2i0f	Padrão		https://api.cvmnews.com.br/audios/ref/6a1def01b3423_1780346625.mp3	https://api.cvmnews.com.br/audios/ref/6a1def01b3423_1780346625.mp3	6a1def01b3423_1780346625.mp3	20260601174333.mp3			0	t	2026-05-16 18:33:57.319	2026-06-03 23:32:29.514	1
cmp8oqe3n000tl804eagswb88	cmp8oqe0g000rl804jl0ld740	Padrão		/tmp/gradio/2f064de14f1a72ff0bf189bb3eabfba44a62e05e9a8bf57c171e5a178103bef9/Márcio Henrique 1.wav	/audios/ref/6a08b897af6b2_1778956439.wav	6a08b897af6b2_1778956439.wav	Márcio Henrique (1).wav			0	t	2026-05-16 18:34:00.035	2026-06-03 23:32:29.514	1
cmoz6cklb0005jr04yljrzg2d	cmoz6cki40003jr048a9tni7n	Padrão		/tmp/gradio/7452ba15f23263ae1e1b1afda91650ccccacf962db068e21b0942ce9db1246cd/69fff236476aa_1778381366.wav	/audios/ref/6a07ed659c1a2_1778904421.wav	6a07ed659c1a2_1778904421.wav	69fff236476aa_1778381366.wav			0	t	2026-05-10 02:49:26.591	2026-06-03 23:32:29.514	1
cmp8oravw001ql8040hxpuo6g	cmp8orasq001ol804l333hhuc	Padrão		/tmp/gradio/9a187c4f866012cc40ff43d56d1d5ab1b2b70403fc25f3401c214d8b38f33469/locutor impacto 1.wav	/audios/ref/6a08b8c235a2a_1778956482.wav	6a08b8c235a2a_1778956482.wav	locutor impacto 1.wav			0	t	2026-05-16 18:34:42.525	2026-06-03 23:32:29.514	1
cmp8mfe3k0001k0045ub5682i	cmp8mdyno0000la041eu40xry	Animada		/tmp/gradio/02f1136015764c405e489f896859d097df6a2bbb283e60c30d24847bda37654e/6a08a8cc99a0f_1778952396.wav	/audios/ref/6a08a9a6d4df2_1778952614.wav	6a08a9a6d4df2_1778952614.wav	6a08a8cc99a0f_1778952396.wav			0	t	2026-05-16 17:29:27.584	2026-06-03 23:32:29.514	1
cmp8oouvb0002l704lflzjwcm	cmp8oouol0000l7047pfzai6j	Padrão		https://api.cvmnews.com.br/audios/ref/6a1f41851277b_1780433285.wav	https://api.cvmnews.com.br/audios/ref/6a1f41851277b_1780433285.wav	6a1f41851277b_1780433285.wav	Locutor 1.wav			0	t	2026-05-16 18:32:48.456	2026-06-03 23:32:29.514	1
cmp8op111000bl7044s8v6877	cmp8op0xt0009l704sz9fbgkm	Padrão		https://api.cvmnews.com.br/audios/ref/6a1dbf648c14a_1780334436.mp3	https://api.cvmnews.com.br/audios/ref/6a1dbf648c14a_1780334436.mp3	6a1dbf648c14a_1780334436.mp3	voz 2 fala.mp3			0	t	2026-05-16 18:32:56.438	2026-06-03 23:32:29.514	1
cmp8oqgar000wl8046dufl3ya	cmp8oqg7l000ul8040rpthpdg	Padrão		https://api.cvmnews.com.br/audios/ref/6a1dc2dfb4430_1780335327.mp3	https://api.cvmnews.com.br/audios/ref/6a1dc2dfb4430_1780335327.mp3	6a1dc2dfb4430_1780335327.mp3	Márcio Henrique.mp3			0	t	2026-05-16 18:34:02.884	2026-06-03 23:32:29.514	1
cmp8or935001nl804hqprgeun	cmp8or8zz001ll804rdmbp7xt	Padrão		/tmp/gradio/428a76d06e24ec314fc2c7d64a926d358b1e2f6553b36194f2a47612023b0360/locutor de radio.wav	/audios/ref/6a08b8bfd24ae_1778956479.wav	6a08b8bfd24ae_1778956479.wav	locutor de radio.wav			0	t	2026-05-16 18:34:40.194	2026-06-03 23:32:29.514	1
cmoz6cnqx000bjr04akw10bxb	cmoz6cnnp0009jr049kbejvcg	Padrão		/tmp/gradio/b8a691391654d7b53be03e14d2eb2d66ff45c60f8b501078058f9e32f1bf961b/69fff23a6214b_1778381370.mp3	/audios/ref/6a071570e48f6_1778849136.mp3	6a071570e48f6_1778849136.mp3	69fff23a6214b_1778381370.mp3			0	t	2026-05-10 02:49:30.681	2026-06-03 23:32:29.514	1
cmoz6cqqt000hjr0468zzitfr	cmoz6cqnm000fjr04eb63zb5s	Padrão		/tmp/gradio/c5de42c75a278ab8ce9d448b391554cccb45638ce9e1f8bdabe6c937980f8001/69fff23e4ee28_1778381374.wav	/audios/ref/6a07edf4d5ef8_1778904564.wav	6a07edf4d5ef8_1778904564.wav	69fff23e4ee28_1778381374.wav			0	t	2026-05-10 02:49:34.566	2026-06-03 23:32:29.514	1
cmoys3e580002ju04pm7gg4qz	cmoso2i1t0000l4041iv52fe8	voz 2		/tmp/gradio/75c32bb4d9dbe0f69d6081b4724797e3d6259f3f495bc876d5e2d6251dbf579b/marcos brasil rodeio.wav	/audios/ref/6a07ec8346197_1778904195.wav	6a07ec8346197_1778904195.wav	marcos brasil rodeio.wav			0	t	2026-05-09 20:10:23.708	2026-06-03 23:32:29.514	1
cmoz0y2vz0001k0045jcnjgvk	cmoz0wgs30000jp0478q5dnar	Voz para Liquidação		/tmp/gradio/910bb9d3e4484da9ace44286732f000d4aba173ba9fec5c2f379507df0945992/69ffcec06a8e0_1778372288.wav	/audios/ref/6a07ed0a3bbf5_1778904330.wav	6a07ed0a3bbf5_1778904330.wav	69ffcec06a8e0_1778372288.wav			0	t	2026-05-10 00:18:12.383	2026-06-03 23:32:29.514	1
cmoz0ymmk0001l504hj4jkbku	cmoz0wgs30000jp0478q5dnar	vendas		/tmp/gradio/bf160394260a47e58eeb7e11689151fbd89cf47fca96d8bf7a01b92e92f6b141/69ffcedabcf34_1778372314.wav	/audios/ref/6a07ecfca5052_1778904316.wav	6a07ecfca5052_1778904316.wav	69ffcedabcf34_1778372314.wav			0	t	2026-05-10 00:18:37.964	2026-06-03 23:32:29.514	1
cmoz6cx4f0002l5041pgs5e2z	cmoz6cwy20000l5048iocis6z	Padrão		/tmp/gradio/977e9decd7d43e52fced13d08da9b7f7270d89434e99d1d33622d5941d65c448/Paty.wav	/audios/ref/6a07ee17dff7d_1778904599.wav	6a07ee17dff7d_1778904599.wav	Paty.wav			0	t	2026-05-10 02:49:42.832	2026-06-03 23:32:29.514	1
cmp8m96e90002i904s02tpr84	cmp8m7my90000i904xsk41d6h	Eventos - Festas -Shows		/tmp/gradio/1bf8598ac43ec13c39a2a385b5891c2feaeb050c6a132a961e7b50e9efa67fb2/6a07c92172c2a_1778895137.wav	/audios/ref/6a08a84e30d9c_1778952270.wav	6a08a84e30d9c_1778952270.wav	6a07c92172c2a_1778895137.wav			0	t	2026-05-16 17:24:37.665	2026-06-03 23:32:29.514	1
cmoz6ct0r000kjr04q0r9ujq7	cmoz6csxk000ijr04jse8fc4s	Padrão		/tmp/gradio/f1603618a1533894c58b9c2288db6cac2977901aee62bb1aeef940d6fd00879b/69fff2411a2ee_1778381377.wav	/audios/ref/6a07ee08b8aff_1778904584.wav	6a07ee08b8aff_1778904584.wav	69fff2411a2ee_1778381377.wav			0	t	2026-05-10 02:49:37.515	2026-06-03 23:32:29.514	1
cmp8oqq4o0012l804d9csynej	cmp8oqq1i0010l8046pr6y532	Padrão		/tmp/gradio/29cb3625654d638c0fb1f87533258622ab25bba1263ca3d5698f93e9f110eb0e/Renato Impacto.mp3 hearthis.at.wav	/audios/ref/6a08b8a740aaf_1778956455.wav	6a08b8a740aaf_1778956455.wav	Renato Impacto.mp3 (hearthis.at).wav			0	t	2026-05-16 18:34:15.624	2026-06-03 23:32:29.514	1
cmoz6cp4c000ejr04bepigtid	cmoz6cp15000cjr04zgs0pa2n	Padrão		/tmp/gradio/e9310d8541afc38447041fd2a10b82554a4dde3bfcb0b5b22db8a351a84a0c1f/69fff23c309bb_1778381372.wav	/audios/ref/6a07ede0c8600_1778904544.wav	6a07ede0c8600_1778904544.wav	69fff23c309bb_1778381372.wav			0	t	2026-05-10 02:49:32.461	2026-06-03 23:32:29.514	1
cmpj8i0yg000hk4041p31ds6i	cmpj8i0v7000fk404p8q8m2tx	Padrão		/tmp/gradio/7db6261a9342d014b3d1db2c5e5156d4cac369e914f630f0b3c41763c696e44a/dutra.wav	http://147.15.77.137/audios/ref/6a18c4c25030a_1780008130.wav	6a18c4c25030a_1780008130.wav	dutra.wav			0	t	2026-05-24 03:45:03.832	2026-06-03 23:32:29.514	1
cmp8orjg00022l804yk3pbs02	cmp8orjct0020l804hljmh5yr	Padrão		https://api.cvmnews.com.br/audios/ref/6a1e13c763482_1780356039.mp3	https://api.cvmnews.com.br/audios/ref/6a1e13c763482_1780356039.mp3	6a1e13c763482_1780356039.mp3	Tauema Impacto.mp3 (hearthis.at).mp3			0	t	2026-05-16 18:34:53.616	2026-06-03 23:32:29.514	1
cmp8orm160025l804pbyjp9sw	cmp8orly00023l8041ubn9p1u	Padrão		/tmp/gradio/5159ab7719777c95c4b9c86c1d2dc64a800146cf408803eef77a594e25efcac9/voz 3 fala.mp3	https://api.cvmnews.com.br/audios/ref/6a1bbdf705fb4_1780202999.wav	6a1bbdf705fb4_1780202999.wav	voz 3 fala.wav			0	t	2026-05-16 18:34:56.97	2026-06-03 23:32:29.514	1
cmpj8jgns000qk404co99uqc2	cmpj8jgki000ok404f9wkdmjp	Padrão		/tmp/gradio/ece32883ff34fd955b34e7d7196fb95f11ec188444fd5ff33f7bd7e0198c9668/0942720001554330189.mp3	/audios/ref/6a1274828d551_1779594370.mp3	6a1274828d551_1779594370.mp3	0942720001554330189.mp3			0	t	2026-05-24 03:46:10.84	2026-06-03 23:32:29.514	1
cmpj8jo2n0015k4049sxymwxg	cmpj8jnze0013k404anzpzesq	Padrão		/tmp/gradio/cc4d9d162e1b68b8f52cabf616344a8f9d0ebe93d28be8e92132e448774c75f1/Tito Maciel.mp3	/audios/ref/6a12748c2cb39_1779594380.mp3	6a12748c2cb39_1779594380.mp3	Tito Maciel.mp3			0	t	2026-05-24 03:46:20.447	2026-05-24 03:46:20.447	1
cmpj8h9tr0005l404z9k04ts0	cmpj8h9qi0003l404q0ade6k9	Padrão		/tmp/gradio/102683111573dc4c45d41c2710fb74c0de0c965299ec5ece4d838fafc242a598/sabrina.wav	http://147.15.77.137/audios/ref/6a1825dc14e54_1779967452.wav	6a1825dc14e54_1779967452.wav	sabrina.wav			0	t	2026-05-24 03:44:28.672	2026-06-03 23:32:29.514	1
cmp8orf6y001wl8049x5qd056	cmp8orf3r001ul804ryifsn6q	Padrão		/tmp/gradio/248fce5f3deb17514be8861ed17010dacd9dfb9e13f30668405e3dffacd79fc4/paulo carvalho.wav	http://147.15.77.137/audios/ref/6a18c6ff7195d_1780008703.wav	6a18c6ff7195d_1780008703.wav	paulo carvalho.wav			0	t	2026-05-16 18:34:48.106	2026-06-03 23:32:29.514	1
cmp8or378001el804bj070szt	cmp8or33l001cl804nbk49yv6	Padrão		https://api.cvmnews.com.br/audios/ref/6a1de71e4d68c_1780344606.mp3	https://api.cvmnews.com.br/audios/ref/6a1de71e4d68c_1780344606.mp3	6a1de71e4d68c_1780344606.mp3	Freire Impacto (hearthis.at).mp3			0	t	2026-05-16 18:34:32.564	2026-06-03 23:32:29.514	1
cmp8orncr0028l804nw80koaw	cmp8orn9l0026l804jcj7hpvi	Padrão		/tmp/gradio/c3bf8e42ecb895ab0c99358a08597ff0edf6f314da23783a371f3bac6557e7ca/voz nova locutor caitá.mp3	/audios/ref/6a08b8d25ff9d_1778956498.mp3	6a08b8d25ff9d_1778956498.mp3	voz nova locutor caitá.mp3			0	t	2026-05-16 18:34:58.683	2026-06-03 23:32:29.514	1
cmpj8hsqq0002k404qpb3zlqi	cmpj8hsk90000k404md348pke	Padrão		/tmp/gradio/bcf2068f5c3da24915317c7762c319a1010b54b574dc3ed28ef508015d7f29e0/dutra 2.mp3	/audios/ref/6a127434c1578_1779594292.mp3	6a127434c1578_1779594292.mp3	dutra 2.mp3			0	t	2026-05-24 03:44:53.186	2026-06-03 23:32:29.514	1
cmpj8i33v000kk4040oin06et	cmpj8i30m000ik404za9651jp	Padrão		/tmp/gradio/135dc7ea1a33d3f3d812a42db66f9955574c0d61dfd5a8328f2a5f27e27a1edb/0428485001770293697 1.mp3	/audios/ref/6a12744234195_1779594306.mp3	6a12744234195_1779594306.mp3	0428485001770293697 (1).mp3			0	t	2026-05-24 03:45:06.619	2026-06-03 23:32:29.514	1
cmpj8jesq000nk404oi3e74dq	cmpj8jeph000lk404lnpmbbel	Padrão		/tmp/gradio/ac5717f22bbcf6fa92145d0fba2d6cc92422211f949b739ff2c6f87f6d7eb9ae/Juninho Carlos.mp3	/audios/ref/6a12748022204_1779594368.mp3	6a12748022204_1779594368.mp3	Juninho Carlos.mp3			0	t	2026-05-24 03:46:08.427	2026-06-03 23:32:29.514	1
cmpj8ji55000tk4043o5fhklq	cmpj8ji1w000rk404ed7634tp	Padrão		/tmp/gradio/52e64945d7e2806c52a414ab4475493330c7fb86223c95c6792027e44fb8ea71/0428485001770293697.mp3	/audios/ref/6a127484792ec_1779594372.mp3	6a127484792ec_1779594372.mp3	0428485001770293697.mp3			0	t	2026-05-24 03:46:12.762	2026-06-03 23:32:29.514	1
cmpj8jjdg000wk404c1a2m8d0	cmpj8jja7000uk404etcfyoy5	Padrão		/tmp/gradio/e1e776894fa493c6edc914c05607553117742b5916031db851475ebf213e41dc/Vanderley.mp3	/audios/ref/6a127486141d5_1779594374.mp3	6a127486141d5_1779594374.mp3	Vanderley.mp3			0	t	2026-05-24 03:46:14.357	2026-06-03 23:32:29.514	1
cmpj8jl5y000zk4048uql6mfu	cmpj8jl2o000xk404wc94umd2	Padrão		/tmp/gradio/9665f01f3c9f8808ed10a3dd94ef97fb82b23c047d1c9cd9685621c05f167f8f/NOEL LUCAS.mp3	/audios/ref/6a12748865851_1779594376.mp3	6a12748865851_1779594376.mp3	NOEL LUCAS.mp3			0	t	2026-05-24 03:46:16.678	2026-06-03 23:32:29.514	1
cmoxp5cp60001l704p03fxwze	cmoxp2op50000l404arl6znqd	Alegre		/tmp/gradio/3194f49d5658a41b92b91867a7e20f9a0814e0698330887560363ab34a40a91f/69fe95239bc4b_1778292003.wav	/audios/ref/6a07eca2d9779_1778904226.wav	6a07eca2d9779_1778904226.wav	69fe95239bc4b_1778292003.wav			0	t	2026-05-09 02:00:10.122	2026-06-03 23:32:29.514	1
cmoxq3t7y0001js04hxcizf38	cmoxp2op50000l404arl6znqd	Narrador profissional		/tmp/gradio/b08a3ee57244346b8ee46bcf586c26d4560dcb61344cbfcc270fea392a2a88c6/69fe9be2cd724_1778293730.wav	/audios/ref/6a07ece19171d_1778904289.wav	6a07ece19171d_1778904289.wav	69fe9be2cd724_1778293730.wav			0	t	2026-05-09 02:26:57.838	2026-06-03 23:32:29.514	1
cmoxq8rz10001jp043h98iaha	cmoxp2op50000l404arl6znqd	Suave		/tmp/gradio/8dcf401694c6ea781d33b4efb001bfa801ba73d852f59fa4f2d69396cd95939f/69fe9c9ee60f6_1778293918.wav	/audios/ref/6a07ecc231d3b_1778904258.wav	6a07ecc231d3b_1778904258.wav	69fe9c9ee60f6_1778293918.wav			0	t	2026-05-09 02:30:49.501	2026-06-03 23:32:29.514	1
cmoyrcqkf0001jr0440abj3h3	cmoyrc3qr0000ju04olt82yt0	Batidão		/tmp/gradio/4e25fe60ec30e141cc59a49723c145ce6c7d35585f6f40f0c27a90df4997269d/69ff8fd0c102b_1778356176.wav	/audios/ref/6a07ed49601c4_1778904393.wav	6a07ed49601c4_1778904393.wav	69ff8fd0c102b_1778356176.wav			0	t	2026-05-09 19:49:40.096	2026-06-03 23:32:29.514	1
cmoyrh6c30001jr04aqxhc64p	cmoyrg9vp0000jv04fahfxyge	Sussurado		/tmp/gradio/e6d8f56dd386f2f5cebc4ee03bef04f4e31cf4955d6c0ca7159ae4f8eef90a6a/69ff90a02f536_1778356384.mp3	/audios/ref/6a0770f81c84b_1778872568.mp3	6a0770f81c84b_1778872568.mp3	69ff90a02f536_1778356384.mp3			0	t	2026-05-09 19:53:07.155	2026-06-03 23:32:29.514	1
\.


--
-- Name: GenerationQueue GenerationQueue_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."GenerationQueue"
    ADD CONSTRAINT "GenerationQueue_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: Speaker Speaker_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."Speaker"
    ADD CONSTRAINT "Speaker_pkey" PRIMARY KEY (id);


--
-- Name: SystemSetting SystemSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."SystemSetting"
    ADD CONSTRAINT "SystemSetting_pkey" PRIMARY KEY (id);


--
-- Name: Track Track_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."Track"
    ADD CONSTRAINT "Track_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VoiceVariation VoiceVariation_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."VoiceVariation"
    ADD CONSTRAINT "VoiceVariation_pkey" PRIMARY KEY (id);


--
-- Name: Voice Voice_pkey; Type: CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."Voice"
    ADD CONSTRAINT "Voice_pkey" PRIMARY KEY (id);


--
-- Name: GenerationQueue_createdAt_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "GenerationQueue_createdAt_idx" ON public."GenerationQueue" USING btree ("createdAt");


--
-- Name: GenerationQueue_status_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "GenerationQueue_status_idx" ON public."GenerationQueue" USING btree (status);


--
-- Name: GenerationQueue_userId_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "GenerationQueue_userId_idx" ON public."GenerationQueue" USING btree ("userId");


--
-- Name: Payment_externalRef_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "Payment_externalRef_idx" ON public."Payment" USING btree ("externalRef");


--
-- Name: Payment_externalRef_key; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE UNIQUE INDEX "Payment_externalRef_key" ON public."Payment" USING btree ("externalRef");


--
-- Name: Payment_status_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "Payment_status_idx" ON public."Payment" USING btree (status);


--
-- Name: Payment_userId_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "Payment_userId_idx" ON public."Payment" USING btree ("userId");


--
-- Name: Session_tokenHash_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "Session_tokenHash_idx" ON public."Session" USING btree ("tokenHash");


--
-- Name: Session_userId_idx; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE INDEX "Session_userId_idx" ON public."Session" USING btree ("userId");


--
-- Name: Speaker_speakerFile_key; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE UNIQUE INDEX "Speaker_speakerFile_key" ON public."Speaker" USING btree ("speakerFile");


--
-- Name: SystemSetting_key_key; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE UNIQUE INDEX "SystemSetting_key_key" ON public."SystemSetting" USING btree (key);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_googleId_key; Type: INDEX; Schema: public; Owner: omnivoice
--

CREATE UNIQUE INDEX "User_googleId_key" ON public."User" USING btree ("googleId");


--
-- Name: GenerationQueue GenerationQueue_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."GenerationQueue"
    ADD CONSTRAINT "GenerationQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Payment Payment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: VoiceVariation VoiceVariation_voiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: omnivoice
--

ALTER TABLE ONLY public."VoiceVariation"
    ADD CONSTRAINT "VoiceVariation_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES public."Voice"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO omnivoice;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO tecos;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO omnivoice;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO tecos;


--
-- PostgreSQL database dump complete
--

\unrestrict Nfagn7GaH9GKcbHVDmcdxINe0eTZzHFrvnrzWvwdWYy94EhDXurNOu8Wr1wQ04Q

