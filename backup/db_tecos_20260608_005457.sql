--
-- PostgreSQL database dump
--

\restrict 3sASZ0eDigx2XQWym4xI6UPRUEn5QYBxBdfDn6JoEo8faVJaEwYkqAy9Aggl0q5

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Assinatura; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Assinatura" (
    id text NOT NULL,
    "osId" text NOT NULL,
    imagem text NOT NULL,
    nome text,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Assinatura" OWNER TO tecos;

--
-- Name: Avaliacao; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Avaliacao" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "osId" text NOT NULL,
    "clienteId" text,
    nota integer NOT NULL,
    comentario text,
    resposta text,
    "dataResposta" timestamp(3) without time zone,
    aprovado boolean DEFAULT true NOT NULL,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Avaliacao" OWNER TO tecos;

--
-- Name: Caixa; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Caixa" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "usuarioAbertura" text NOT NULL,
    "usuarioFechamento" text,
    "saldoInicial" double precision NOT NULL,
    "saldoFinal" double precision,
    "totalVendas" double precision DEFAULT 0 NOT NULL,
    "totalDinheiro" double precision DEFAULT 0 NOT NULL,
    "totalPix" double precision DEFAULT 0 NOT NULL,
    "totalCartaoCredito" double precision DEFAULT 0 NOT NULL,
    "totalCartaoDebito" double precision DEFAULT 0 NOT NULL,
    "totalOutros" double precision DEFAULT 0 NOT NULL,
    "totalSangrias" double precision DEFAULT 0 NOT NULL,
    "totalReforcos" double precision DEFAULT 0 NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    "observacaoAbertura" text,
    "observacaoFechamento" text,
    "dataAbertura" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dataFechamento" timestamp(3) without time zone,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Caixa" OWNER TO tecos;

--
-- Name: Categoria; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Categoria" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    nome text NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Categoria" OWNER TO tecos;

--
-- Name: Cliente; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Cliente" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    nome text NOT NULL,
    telefone text NOT NULL,
    email text,
    cpf text,
    endereco text,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Cliente" OWNER TO tecos;

--
-- Name: Configuracao; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Configuracao" (
    id text NOT NULL,
    chave text NOT NULL,
    valor text NOT NULL,
    descricao text,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Configuracao" OWNER TO tecos;

--
-- Name: ConfiguracaoPagamento; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."ConfiguracaoPagamento" (
    id text NOT NULL,
    "mpAccessToken" text,
    "mpPublicKey" text,
    "mpClientId" text,
    "mpClientSecret" text,
    "mpAmbiente" text DEFAULT 'sandbox'::text NOT NULL,
    "mpWebhookSecret" text,
    "chavePix" text,
    "tipoChavePix" text,
    "nomeRecebedor" text,
    "valorMensalidade" double precision DEFAULT 99.90 NOT NULL,
    "valorAnuidade" double precision DEFAULT 999.00 NOT NULL,
    "diaVencimento" integer DEFAULT 10 NOT NULL,
    "diasBloqueio" integer DEFAULT 20 NOT NULL,
    "diasTolerancia" integer DEFAULT 3 NOT NULL,
    ativo boolean DEFAULT false NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ConfiguracaoPagamento" OWNER TO tecos;

--
-- Name: ContadorOS; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."ContadorOS" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "ultimoNumero" integer DEFAULT 0 NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."ContadorOS" OWNER TO tecos;

--
-- Name: Fatura; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Fatura" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "numeroFatura" integer NOT NULL,
    valor double precision NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    "formaPagamento" text,
    "mpPaymentId" text,
    "mpPreferenceId" text,
    "codigoPix" text,
    "qrCodePix" text,
    "linkBoleto" text,
    "codigoBoleto" text,
    "linkPagamento" text,
    "dataVencimento" timestamp(3) without time zone NOT NULL,
    "dataPagamento" timestamp(3) without time zone,
    "dataCriacao" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dataLembrete" timestamp(3) without time zone,
    "atualizadoEm" timestamp(3) without time zone NOT NULL,
    referencia text,
    observacao text
);


ALTER TABLE public."Fatura" OWNER TO tecos;

--
-- Name: FotoOS; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."FotoOS" (
    id text NOT NULL,
    "osId" text NOT NULL,
    arquivo text NOT NULL,
    descricao text,
    tipo text DEFAULT 'recebimento'::text NOT NULL,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."FotoOS" OWNER TO tecos;

--
-- Name: HistoricoOS; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."HistoricoOS" (
    id text NOT NULL,
    "osId" text NOT NULL,
    descricao text NOT NULL,
    status text,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."HistoricoOS" OWNER TO tecos;

--
-- Name: ItemVenda; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."ItemVenda" (
    id text NOT NULL,
    "vendaId" text NOT NULL,
    "produtoId" text,
    "codigoBarras" text,
    descricao text NOT NULL,
    quantidade integer NOT NULL,
    "precoUnitario" double precision NOT NULL,
    desconto double precision DEFAULT 0 NOT NULL,
    total double precision NOT NULL,
    tipo text DEFAULT 'produto'::text NOT NULL,
    observacao text,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ItemVenda" OWNER TO tecos;

--
-- Name: Loja; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Loja" (
    id text NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    responsavel text NOT NULL,
    "cpfCnpj" text,
    telefone text NOT NULL,
    whatsapp text NOT NULL,
    email text NOT NULL,
    "senhaHash" text NOT NULL,
    cidade text NOT NULL,
    estado text NOT NULL,
    endereco text NOT NULL,
    "numeroEndereco" text DEFAULT 'S/N'::text,
    bairro text,
    cep text,
    complemento text,
    descricao text,
    logo text,
    "horarioAtendimento" text,
    "tiposServico" text,
    status text DEFAULT 'pendente'::text NOT NULL,
    plano text DEFAULT 'basico'::text NOT NULL,
    "precoPlano" double precision DEFAULT 99.90 NOT NULL,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL,
    "expiraEm" timestamp(3) without time zone,
    "trialAte" timestamp(3) without time zone,
    "trialUsado" boolean DEFAULT false NOT NULL,
    bloqueado boolean DEFAULT false NOT NULL,
    "motivoBloqueio" text,
    "mpCustomerId" text,
    "mpAccessToken" text,
    "mpRefreshToken" text,
    "mpPublicKey" text,
    "mpUserId" text,
    "mpTokenExpiresAt" timestamp(3) without time zone,
    "mpConectado" boolean DEFAULT false NOT NULL,
    "usarPagamentoSistema" boolean DEFAULT false NOT NULL,
    "efiClientId" text,
    "efiClientSecret" text,
    "efiAmbiente" text DEFAULT 'homologacao'::text,
    "pixChave" text,
    "pixTipo" text,
    "pixNome" text
);


ALTER TABLE public."Loja" OWNER TO tecos;

--
-- Name: MovimentacaoCaixa; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."MovimentacaoCaixa" (
    id text NOT NULL,
    "caixaId" text NOT NULL,
    tipo text NOT NULL,
    valor double precision NOT NULL,
    descricao text NOT NULL,
    "formaPagamento" text,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."MovimentacaoCaixa" OWNER TO tecos;

--
-- Name: Notificacao; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Notificacao" (
    id text NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    mensagem text NOT NULL,
    lida boolean DEFAULT false NOT NULL,
    "referenciaId" text,
    "referenciaTipo" text,
    "lojaId" text,
    "usuarioId" text,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Notificacao" OWNER TO tecos;

--
-- Name: OrdemServico; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."OrdemServico" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "clienteId" text NOT NULL,
    "tecnicoId" text,
    "numeroOs" integer NOT NULL,
    "codigoOs" text NOT NULL,
    "codigoAcesso" text,
    equipamento text NOT NULL,
    marca text,
    modelo text,
    "imeiSerial" text,
    "senhaAparelho" text,
    problema text NOT NULL,
    acessorios text,
    "estadoAparelho" text,
    diagnostico text,
    solucao text,
    status text DEFAULT 'recebido'::text NOT NULL,
    orcamento double precision,
    aprovado boolean,
    "dataAprovacao" timestamp(3) without time zone,
    "valorServico" double precision,
    "valorPecas" double precision,
    "valorTotal" double precision,
    pago boolean DEFAULT false NOT NULL,
    "formaPagamento" text,
    "dataPagamento" timestamp(3) without time zone,
    "dataCriacao" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dataPrevisao" timestamp(3) without time zone,
    "dataFinalizacao" timestamp(3) without time zone,
    "atualizadoEm" timestamp(3) without time zone NOT NULL,
    "garantiaDias" integer,
    "garantiaInicio" timestamp(3) without time zone,
    "garantiaFim" timestamp(3) without time zone,
    "mpPaymentId" text,
    "mpPreferenceId" text,
    "linkPagamento" text,
    "pixQrCode" text,
    "pixCopiaCola" text,
    "boletoUrl" text,
    "boletoLinhaDigitavel" text,
    "efiPaymentId" text,
    "efiPixQrCode" text,
    "efiPixCopiaCola" text,
    "efiTxId" text,
    "pagamentoGateway" text,
    "pesquisaEnviada" boolean DEFAULT false NOT NULL,
    "dataPesquisaEnviada" timestamp(3) without time zone
);


ALTER TABLE public."OrdemServico" OWNER TO tecos;

--
-- Name: Produto; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Produto" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "categoriaId" text,
    "codigoBarras" text,
    "codigoInterno" text,
    nome text NOT NULL,
    descricao text,
    "precoCusto" double precision,
    "precoVenda" double precision NOT NULL,
    estoque integer DEFAULT 0 NOT NULL,
    "estoqueMinimo" integer DEFAULT 0 NOT NULL,
    unidade text DEFAULT 'UN'::text NOT NULL,
    localizacao text,
    ativo boolean DEFAULT true NOT NULL,
    "permiteVendaSemEstoque" boolean DEFAULT true NOT NULL,
    imagem text,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Produto" OWNER TO tecos;

--
-- Name: Sessao; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Sessao" (
    id text NOT NULL,
    "lojaId" text,
    "usuarioId" text,
    "superAdminId" text,
    "tokenSessao" text NOT NULL,
    "userAgent" text,
    "ipAddress" text,
    dispositivo text,
    ativa boolean DEFAULT true NOT NULL,
    "dataCriacao" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dataExpiracao" timestamp(3) without time zone NOT NULL,
    "ultimoAcesso" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Sessao" OWNER TO tecos;

--
-- Name: SuperAdmin; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."SuperAdmin" (
    id text NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    "senhaHash" text NOT NULL,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SuperAdmin" OWNER TO tecos;

--
-- Name: Usuario; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Usuario" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    "senhaHash" text NOT NULL,
    foto text,
    tipo text DEFAULT 'tecnico'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Usuario" OWNER TO tecos;

--
-- Name: Venda; Type: TABLE; Schema: public; Owner: tecos
--

CREATE TABLE public."Venda" (
    id text NOT NULL,
    "lojaId" text NOT NULL,
    "caixaId" text NOT NULL,
    "numeroVenda" integer NOT NULL,
    "clienteNome" text,
    "clienteCpf" text,
    subtotal double precision NOT NULL,
    desconto double precision DEFAULT 0 NOT NULL,
    total double precision NOT NULL,
    "formaPagamento" text NOT NULL,
    "valorPago" double precision,
    troco double precision,
    status text DEFAULT 'concluida'::text NOT NULL,
    observacao text,
    tipo text DEFAULT 'produto'::text NOT NULL,
    "dataVenda" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "criadoEm" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "atualizadoEm" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Venda" OWNER TO tecos;

--
-- Data for Name: Assinatura; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Assinatura" (id, "osId", imagem, nome, "criadoEm") FROM stdin;
\.


--
-- Data for Name: Avaliacao; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Avaliacao" (id, "lojaId", "osId", "clienteId", nota, comentario, resposta, "dataResposta", aprovado, "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: Caixa; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Caixa" (id, "lojaId", "usuarioAbertura", "usuarioFechamento", "saldoInicial", "saldoFinal", "totalVendas", "totalDinheiro", "totalPix", "totalCartaoCredito", "totalCartaoDebito", "totalOutros", "totalSangrias", "totalReforcos", status, "observacaoAbertura", "observacaoFechamento", "dataAbertura", "dataFechamento", "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: Categoria; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Categoria" (id, "lojaId", nome, descricao, ativo, "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: Cliente; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Cliente" (id, "lojaId", nome, telefone, email, cpf, endereco, "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: Configuracao; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Configuracao" (id, chave, valor, descricao, "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: ConfiguracaoPagamento; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."ConfiguracaoPagamento" (id, "mpAccessToken", "mpPublicKey", "mpClientId", "mpClientSecret", "mpAmbiente", "mpWebhookSecret", "chavePix", "tipoChavePix", "nomeRecebedor", "valorMensalidade", "valorAnuidade", "diaVencimento", "diasBloqueio", "diasTolerancia", ativo, "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: ContadorOS; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."ContadorOS" (id, "lojaId", "ultimoNumero", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: Fatura; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Fatura" (id, "lojaId", "numeroFatura", valor, status, "formaPagamento", "mpPaymentId", "mpPreferenceId", "codigoPix", "qrCodePix", "linkBoleto", "codigoBoleto", "linkPagamento", "dataVencimento", "dataPagamento", "dataCriacao", "dataLembrete", "atualizadoEm", referencia, observacao) FROM stdin;
\.


--
-- Data for Name: FotoOS; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."FotoOS" (id, "osId", arquivo, descricao, tipo, "criadoEm") FROM stdin;
\.


--
-- Data for Name: HistoricoOS; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."HistoricoOS" (id, "osId", descricao, status, "criadoEm") FROM stdin;
\.


--
-- Data for Name: ItemVenda; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."ItemVenda" (id, "vendaId", "produtoId", "codigoBarras", descricao, quantidade, "precoUnitario", desconto, total, tipo, observacao, "criadoEm") FROM stdin;
\.


--
-- Data for Name: Loja; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Loja" (id, nome, slug, responsavel, "cpfCnpj", telefone, whatsapp, email, "senhaHash", cidade, estado, endereco, "numeroEndereco", bairro, cep, complemento, descricao, logo, "horarioAtendimento", "tiposServico", status, plano, "precoPlano", "criadoEm", "atualizadoEm", "expiraEm", "trialAte", "trialUsado", bloqueado, "motivoBloqueio", "mpCustomerId", "mpAccessToken", "mpRefreshToken", "mpPublicKey", "mpUserId", "mpTokenExpiresAt", "mpConectado", "usarPagamentoSistema", "efiClientId", "efiClientSecret", "efiAmbiente", "pixChave", "pixTipo", "pixNome") FROM stdin;
\.


--
-- Data for Name: MovimentacaoCaixa; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."MovimentacaoCaixa" (id, "caixaId", tipo, valor, descricao, "formaPagamento", "criadoEm") FROM stdin;
\.


--
-- Data for Name: Notificacao; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Notificacao" (id, tipo, titulo, mensagem, lida, "referenciaId", "referenciaTipo", "lojaId", "usuarioId", "criadoEm") FROM stdin;
\.


--
-- Data for Name: OrdemServico; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."OrdemServico" (id, "lojaId", "clienteId", "tecnicoId", "numeroOs", "codigoOs", "codigoAcesso", equipamento, marca, modelo, "imeiSerial", "senhaAparelho", problema, acessorios, "estadoAparelho", diagnostico, solucao, status, orcamento, aprovado, "dataAprovacao", "valorServico", "valorPecas", "valorTotal", pago, "formaPagamento", "dataPagamento", "dataCriacao", "dataPrevisao", "dataFinalizacao", "atualizadoEm", "garantiaDias", "garantiaInicio", "garantiaFim", "mpPaymentId", "mpPreferenceId", "linkPagamento", "pixQrCode", "pixCopiaCola", "boletoUrl", "boletoLinhaDigitavel", "efiPaymentId", "efiPixQrCode", "efiPixCopiaCola", "efiTxId", "pagamentoGateway", "pesquisaEnviada", "dataPesquisaEnviada") FROM stdin;
\.


--
-- Data for Name: Produto; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Produto" (id, "lojaId", "categoriaId", "codigoBarras", "codigoInterno", nome, descricao, "precoCusto", "precoVenda", estoque, "estoqueMinimo", unidade, localizacao, ativo, "permiteVendaSemEstoque", imagem, "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: Sessao; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Sessao" (id, "lojaId", "usuarioId", "superAdminId", "tokenSessao", "userAgent", "ipAddress", dispositivo, ativa, "dataCriacao", "dataExpiracao", "ultimoAcesso") FROM stdin;
cmprliubj0001l204cqad1yp6	\N	\N	sa-rgdweb-001	016fb42bd4b444f0737fc2d5fc3e1135496d6a3f6aa517e6e109b99a872019ab	curl/8.14.1	43.99.15.78	Desktop	f	2026-05-30 00:11:46.303	2026-06-06 00:11:46.302	2026-05-30 00:11:46.303
cmprmzkzu0001ru01xlhlh498	\N	\N	sa-rgdweb-001	18153a89c95857510b5565fbe092d4f828c5e2d049e47b1bf53e76684dfa6c33	curl/8.14.1	43.99.15.78	Desktop	t	2026-05-30 00:52:46.986	2026-06-06 00:52:46.985	2026-05-30 00:52:46.986
cmprlks680003l204406z2cbl	\N	\N	sa-rgdweb-001	ca28fece4ce31237b39779ab85ec7544f5b3e7fb8f66556d9490a329d8b5ce70	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	177.36.178.232	Windows	f	2026-05-30 00:13:16.832	2026-06-06 00:13:16.831	2026-05-30 00:13:19.542
cmprnqbbq0003ru01yq9a8shs	\N	\N	sa-rgdweb-001	b020dfbfbde0cf05231577bfae1a70d0ddddff20ce6fea3b73cc3ea43be4f341	curl/8.14.1	47.86.84.200	Desktop	t	2026-05-30 01:13:34.166	2026-06-06 01:13:34.165	2026-05-30 01:13:34.166
cmprmxf9e0001ru01lqsxrsj7	\N	\N	sa-rgdweb-001	645a7876bc3f12755351e6d8104bcb3b5ebf5f26a8866b4ca890beabe34b65c0	curl/8.14.1	47.242.215.177	Desktop	f	2026-05-30 00:51:06.243	2026-06-06 00:51:06.241	2026-05-30 00:51:06.243
\.


--
-- Data for Name: SuperAdmin; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."SuperAdmin" (id, nome, email, "senhaHash", "criadoEm", "atualizadoEm") FROM stdin;
sa-rgdweb-001	Administrador	contatorgdweb@gmail.com	$2b$12$PK37UGv/haXx5R5oO7WoSelwr7TLKEuqKYG/AgQaX4Enfr8ptN.9O	2026-05-30 00:11:37.363	2026-05-30 00:11:37.363
\.


--
-- Data for Name: Usuario; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Usuario" (id, "lojaId", nome, email, "senhaHash", foto, tipo, ativo, "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Data for Name: Venda; Type: TABLE DATA; Schema: public; Owner: tecos
--

COPY public."Venda" (id, "lojaId", "caixaId", "numeroVenda", "clienteNome", "clienteCpf", subtotal, desconto, total, "formaPagamento", "valorPago", troco, status, observacao, tipo, "dataVenda", "criadoEm", "atualizadoEm") FROM stdin;
\.


--
-- Name: Assinatura Assinatura_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Assinatura"
    ADD CONSTRAINT "Assinatura_pkey" PRIMARY KEY (id);


--
-- Name: Avaliacao Avaliacao_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Avaliacao"
    ADD CONSTRAINT "Avaliacao_pkey" PRIMARY KEY (id);


--
-- Name: Caixa Caixa_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Caixa"
    ADD CONSTRAINT "Caixa_pkey" PRIMARY KEY (id);


--
-- Name: Categoria Categoria_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Categoria"
    ADD CONSTRAINT "Categoria_pkey" PRIMARY KEY (id);


--
-- Name: Cliente Cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_pkey" PRIMARY KEY (id);


--
-- Name: ConfiguracaoPagamento ConfiguracaoPagamento_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."ConfiguracaoPagamento"
    ADD CONSTRAINT "ConfiguracaoPagamento_pkey" PRIMARY KEY (id);


--
-- Name: Configuracao Configuracao_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Configuracao"
    ADD CONSTRAINT "Configuracao_pkey" PRIMARY KEY (id);


--
-- Name: ContadorOS ContadorOS_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."ContadorOS"
    ADD CONSTRAINT "ContadorOS_pkey" PRIMARY KEY (id);


--
-- Name: Fatura Fatura_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Fatura"
    ADD CONSTRAINT "Fatura_pkey" PRIMARY KEY (id);


--
-- Name: FotoOS FotoOS_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."FotoOS"
    ADD CONSTRAINT "FotoOS_pkey" PRIMARY KEY (id);


--
-- Name: HistoricoOS HistoricoOS_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."HistoricoOS"
    ADD CONSTRAINT "HistoricoOS_pkey" PRIMARY KEY (id);


--
-- Name: ItemVenda ItemVenda_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."ItemVenda"
    ADD CONSTRAINT "ItemVenda_pkey" PRIMARY KEY (id);


--
-- Name: Loja Loja_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Loja"
    ADD CONSTRAINT "Loja_pkey" PRIMARY KEY (id);


--
-- Name: MovimentacaoCaixa MovimentacaoCaixa_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."MovimentacaoCaixa"
    ADD CONSTRAINT "MovimentacaoCaixa_pkey" PRIMARY KEY (id);


--
-- Name: Notificacao Notificacao_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Notificacao"
    ADD CONSTRAINT "Notificacao_pkey" PRIMARY KEY (id);


--
-- Name: OrdemServico OrdemServico_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."OrdemServico"
    ADD CONSTRAINT "OrdemServico_pkey" PRIMARY KEY (id);


--
-- Name: Produto Produto_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Produto"
    ADD CONSTRAINT "Produto_pkey" PRIMARY KEY (id);


--
-- Name: Sessao Sessao_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Sessao"
    ADD CONSTRAINT "Sessao_pkey" PRIMARY KEY (id);


--
-- Name: SuperAdmin SuperAdmin_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."SuperAdmin"
    ADD CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY (id);


--
-- Name: Usuario Usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Usuario"
    ADD CONSTRAINT "Usuario_pkey" PRIMARY KEY (id);


--
-- Name: Venda Venda_pkey; Type: CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Venda"
    ADD CONSTRAINT "Venda_pkey" PRIMARY KEY (id);


--
-- Name: Assinatura_osId_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Assinatura_osId_key" ON public."Assinatura" USING btree ("osId");


--
-- Name: Avaliacao_lojaId_aprovado_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Avaliacao_lojaId_aprovado_idx" ON public."Avaliacao" USING btree ("lojaId", aprovado);


--
-- Name: Avaliacao_lojaId_criadoEm_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Avaliacao_lojaId_criadoEm_idx" ON public."Avaliacao" USING btree ("lojaId", "criadoEm");


--
-- Name: Avaliacao_osId_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Avaliacao_osId_key" ON public."Avaliacao" USING btree ("osId");


--
-- Name: Caixa_lojaId_status_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Caixa_lojaId_status_idx" ON public."Caixa" USING btree ("lojaId", status);


--
-- Name: Categoria_lojaId_nome_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Categoria_lojaId_nome_key" ON public."Categoria" USING btree ("lojaId", nome);


--
-- Name: Cliente_lojaId_telefone_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Cliente_lojaId_telefone_key" ON public."Cliente" USING btree ("lojaId", telefone);


--
-- Name: Configuracao_chave_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Configuracao_chave_idx" ON public."Configuracao" USING btree (chave);


--
-- Name: Configuracao_chave_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Configuracao_chave_key" ON public."Configuracao" USING btree (chave);


--
-- Name: ContadorOS_lojaId_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "ContadorOS_lojaId_key" ON public."ContadorOS" USING btree ("lojaId");


--
-- Name: Fatura_lojaId_dataVencimento_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Fatura_lojaId_dataVencimento_idx" ON public."Fatura" USING btree ("lojaId", "dataVencimento");


--
-- Name: Fatura_lojaId_numeroFatura_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Fatura_lojaId_numeroFatura_key" ON public."Fatura" USING btree ("lojaId", "numeroFatura");


--
-- Name: Fatura_lojaId_status_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Fatura_lojaId_status_idx" ON public."Fatura" USING btree ("lojaId", status);


--
-- Name: Fatura_status_dataVencimento_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Fatura_status_dataVencimento_idx" ON public."Fatura" USING btree (status, "dataVencimento");


--
-- Name: ItemVenda_vendaId_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "ItemVenda_vendaId_idx" ON public."ItemVenda" USING btree ("vendaId");


--
-- Name: Loja_email_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Loja_email_key" ON public."Loja" USING btree (email);


--
-- Name: Loja_slug_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Loja_slug_key" ON public."Loja" USING btree (slug);


--
-- Name: MovimentacaoCaixa_caixaId_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "MovimentacaoCaixa_caixaId_idx" ON public."MovimentacaoCaixa" USING btree ("caixaId");


--
-- Name: Notificacao_criadoEm_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Notificacao_criadoEm_idx" ON public."Notificacao" USING btree ("criadoEm");


--
-- Name: Notificacao_lojaId_lida_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Notificacao_lojaId_lida_idx" ON public."Notificacao" USING btree ("lojaId", lida);


--
-- Name: Notificacao_tipo_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Notificacao_tipo_idx" ON public."Notificacao" USING btree (tipo);


--
-- Name: OrdemServico_codigoAcesso_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "OrdemServico_codigoAcesso_key" ON public."OrdemServico" USING btree ("codigoAcesso");


--
-- Name: OrdemServico_codigoOs_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "OrdemServico_codigoOs_key" ON public."OrdemServico" USING btree ("codigoOs");


--
-- Name: OrdemServico_lojaId_numeroOs_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "OrdemServico_lojaId_numeroOs_key" ON public."OrdemServico" USING btree ("lojaId", "numeroOs");


--
-- Name: Produto_codigoBarras_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Produto_codigoBarras_idx" ON public."Produto" USING btree ("codigoBarras");


--
-- Name: Produto_codigoBarras_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Produto_codigoBarras_key" ON public."Produto" USING btree ("codigoBarras");


--
-- Name: Produto_lojaId_codigoInterno_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Produto_lojaId_codigoInterno_key" ON public."Produto" USING btree ("lojaId", "codigoInterno");


--
-- Name: Sessao_dataExpiracao_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Sessao_dataExpiracao_idx" ON public."Sessao" USING btree ("dataExpiracao");


--
-- Name: Sessao_lojaId_ativa_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Sessao_lojaId_ativa_idx" ON public."Sessao" USING btree ("lojaId", ativa);


--
-- Name: Sessao_superAdminId_ativa_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Sessao_superAdminId_ativa_idx" ON public."Sessao" USING btree ("superAdminId", ativa);


--
-- Name: Sessao_tokenSessao_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Sessao_tokenSessao_key" ON public."Sessao" USING btree ("tokenSessao");


--
-- Name: Sessao_usuarioId_ativa_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Sessao_usuarioId_ativa_idx" ON public."Sessao" USING btree ("usuarioId", ativa);


--
-- Name: SuperAdmin_email_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "SuperAdmin_email_key" ON public."SuperAdmin" USING btree (email);


--
-- Name: Usuario_lojaId_email_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Usuario_lojaId_email_key" ON public."Usuario" USING btree ("lojaId", email);


--
-- Name: Venda_lojaId_dataVenda_idx; Type: INDEX; Schema: public; Owner: tecos
--

CREATE INDEX "Venda_lojaId_dataVenda_idx" ON public."Venda" USING btree ("lojaId", "dataVenda");


--
-- Name: Venda_lojaId_numeroVenda_key; Type: INDEX; Schema: public; Owner: tecos
--

CREATE UNIQUE INDEX "Venda_lojaId_numeroVenda_key" ON public."Venda" USING btree ("lojaId", "numeroVenda");


--
-- Name: Assinatura Assinatura_osId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Assinatura"
    ADD CONSTRAINT "Assinatura_osId_fkey" FOREIGN KEY ("osId") REFERENCES public."OrdemServico"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Avaliacao Avaliacao_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Avaliacao"
    ADD CONSTRAINT "Avaliacao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Caixa Caixa_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Caixa"
    ADD CONSTRAINT "Caixa_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Categoria Categoria_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Categoria"
    ADD CONSTRAINT "Categoria_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Cliente Cliente_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Fatura Fatura_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Fatura"
    ADD CONSTRAINT "Fatura_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FotoOS FotoOS_osId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."FotoOS"
    ADD CONSTRAINT "FotoOS_osId_fkey" FOREIGN KEY ("osId") REFERENCES public."OrdemServico"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: HistoricoOS HistoricoOS_osId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."HistoricoOS"
    ADD CONSTRAINT "HistoricoOS_osId_fkey" FOREIGN KEY ("osId") REFERENCES public."OrdemServico"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ItemVenda ItemVenda_produtoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."ItemVenda"
    ADD CONSTRAINT "ItemVenda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES public."Produto"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ItemVenda ItemVenda_vendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."ItemVenda"
    ADD CONSTRAINT "ItemVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES public."Venda"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MovimentacaoCaixa MovimentacaoCaixa_caixaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."MovimentacaoCaixa"
    ADD CONSTRAINT "MovimentacaoCaixa_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES public."Caixa"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OrdemServico OrdemServico_clienteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."OrdemServico"
    ADD CONSTRAINT "OrdemServico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES public."Cliente"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OrdemServico OrdemServico_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."OrdemServico"
    ADD CONSTRAINT "OrdemServico_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OrdemServico OrdemServico_tecnicoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."OrdemServico"
    ADD CONSTRAINT "OrdemServico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Produto Produto_categoriaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Produto"
    ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES public."Categoria"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Produto Produto_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Produto"
    ADD CONSTRAINT "Produto_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Sessao Sessao_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Sessao"
    ADD CONSTRAINT "Sessao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Sessao Sessao_superAdminId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Sessao"
    ADD CONSTRAINT "Sessao_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES public."SuperAdmin"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Sessao Sessao_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Sessao"
    ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Usuario Usuario_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Usuario"
    ADD CONSTRAINT "Usuario_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Venda Venda_caixaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Venda"
    ADD CONSTRAINT "Venda_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES public."Caixa"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Venda Venda_lojaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tecos
--

ALTER TABLE ONLY public."Venda"
    ADD CONSTRAINT "Venda_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES public."Loja"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 3sASZ0eDigx2XQWym4xI6UPRUEn5QYBxBdfDn6JoEo8faVJaEwYkqAy9Aggl0q5

