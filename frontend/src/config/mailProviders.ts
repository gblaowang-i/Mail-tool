export type MailProviderKey =
  | "gmail"
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

