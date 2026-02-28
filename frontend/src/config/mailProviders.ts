export type MailProviderKey =
  | "gmail"
  | "outlook"
  | "office365"
  | "yahoo"
  | "qq"
  | "163"
  | "aliyun"
  | "custom";

export interface MailProviderPreset {
  key: MailProviderKey;
  label: string;
  host: string;
  port: number;
  note?: string;
}

export const MAIL_PROVIDERS: MailProviderPreset[] = [
  {
    key: "gmail",
    label: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    note: "需要在账户中开启 IMAP，并使用应用专用密码"
  },
  {
    key: "outlook",
    label: "Outlook / Hotmail",
    host: "imap-mail.outlook.com",
    port: 993,
    note: "微软已弃用应用密码，个人账号需 OAuth2。企业/学校账号若管理员开启 IMAP 仍可用应用密码，否则请选「自定义」并查阅微软文档。"
  },
  {
    key: "office365",
    label: "Office 365",
    host: "outlook.office365.com",
    port: 993,
    note: "同上，需 OAuth2 或管理员允许的应用密码。"
  },
  {
    key: "yahoo",
    label: "Yahoo Mail",
    host: "imap.mail.yahoo.com",
    port: 993
  },
  {
    key: "qq",
    label: "QQ 邮箱",
    host: "imap.qq.com",
    port: 993,
    note: "需要在 QQ 邮箱中开启 IMAP，并使用授权码"
  },
  {
    key: "163",
    label: "163 邮箱",
    host: "imap.163.com",
    port: 993,
    note: "需要在邮箱设置中开启 IMAP/SMTP 服务"
  },
  {
    key: "aliyun",
    label: "阿里邮箱",
    host: "imap.aliyun.com",
    port: 993
  },
  {
    key: "custom",
    label: "自定义 IMAP",
    host: "",
    port: 993
  }
];

