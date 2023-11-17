import styles from "./styles.module.scss";
export default function Markdown({ children }:{children:any}) {
    return <div className={styles.container}>{children}</div>;
}