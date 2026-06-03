// api/notion.js
// 使用純 CommonJS 語法，免去 Vercel 的編譯與 ESM 轉換相容性問題。

module.exports = async function handler(req, res) {
  // 1. 限制只允許 POST 請求
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { token, databaseId, record } = req.body;

    if (!token || !databaseId || !record) {
      return res.status(400).json({ error: '缺少必要的參數 (token, databaseId 或 record)' });
    }

    // 2. 將資料包裝成 Notion API 要求的格式
    const notionBody = {
      parent: { database_id: databaseId },
      properties: {
        // 標題欄位：結合分類與月份，例如 "日常餐費 2026-06"
        Name: {
          title: [
            {
              text: {
                content: `${record.category} ${record.key}`
              }
            }
          ]
        },
        // 月份文字欄位，例如 "2026-06"
        Month: {
          rich_text: [
            {
              text: {
                content: String(record.key)
              }
            }
          ]
        },
        // 分類單選欄位
        Category: {
          select: {
            name: record.category
          }
        },
        // 金額數字欄位
        Amount: {
          number: Number(record.amount) || 0
        },
        // 備註欄位
        Note: {
          rich_text: [
            {
              text: {
                content: record.note || ""
              }
            }
          ]
        },
        // 來源標記
        Source: {
          select: {
            name: "JZ Gringotts Bank"
          }
        }
      }
    };

    // 3. 發送請求至 Notion 官方 API
    const notionResponse = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notionBody)
    });

    const data = await notionResponse.json();

    if (!notionResponse.ok) {
      return res.status(notionResponse.status).json({
        error: 'Notion API 錯誤',
        details: data
      });
    }

    // 4. 回傳成功結果給前端網頁
    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Notion Proxy 發生錯誤:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
